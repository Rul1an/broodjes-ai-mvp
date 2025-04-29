require('dotenv').config(); // Voor lokaal testen met .env bestand
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// --- Configuratie ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SERVICE_ROLE_KEY; // Gebruik Service Role Key voor backend processen
const openaiApiKey = process.env.OPENAI_API_KEY;
const pollInterval = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10); // Standaard 5 seconden

if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
    console.error("FATAL: Missing environment variables (Supabase URL/Key or OpenAI Key). Exiting.");
    process.exit(1);
}

// --- Clients Initialiseren ---
const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

console.log(`Worker started. Polling Supabase every ${pollInterval}ms.`);

// --- Hoofd Poll Functie ---
async function pollForTasks() {
    console.log('Checking for pending tasks...');
    let task = null;

    try {
        // 1. Zoek een pending taak
        const { data: pendingTasks, error: selectError } = await supabase
            .from('async_tasks')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true }) // Pak de oudste eerst
            .limit(1);

        if (selectError) {
            console.error('Error fetching pending tasks:', selectError);
            return; // Probeer later opnieuw
        }

        if (!pendingTasks || pendingTasks.length === 0) {
            console.log('No pending tasks found.');
            return; // Geen taak, probeer later opnieuw
        }

        task = pendingTasks[0];
        console.log(`Found pending task: ${task.task_id}`);

        // 2. Probeer de taak te "claimen" door status naar processing te zetten
        // Gebruik 'status', 'pending' in de WHERE clause als een soort lock
        const { data: updatedTask, error: updateError } = await supabase
            .from('async_tasks')
            .update({ status: 'processing', started_at: new Date().toISOString() })
            .eq('task_id', task.task_id)
            .eq('status', 'pending') // Alleen updaten als het nog steeds pending is
            .select()
            .single(); // Verwacht 1 rij terug als het lukt

        if (updateError) {
            // Als de error 'PGRST116' (Not Found) is, betekent dit waarschijnlijk dat een andere worker de taak net geclaimd heeft.
            if (updateError.code === 'PGRST116') {
                console.log(`Task ${task.task_id} likely claimed by another worker. Skipping.`);
                return; // Ga door naar de volgende poll
            } else {
                console.error(`Error claiming task ${task.task_id}:`, updateError);
                // Markeer de taak misschien als gefaald, of probeer later opnieuw? Hier kiezen we voor later opnieuw proberen.
                return;
            }
        }

        if (!updatedTask) {
            // Zou niet moeten gebeuren als er geen error was, maar voor de zekerheid.
            console.warn(`Task ${task.task_id} was not updated, possibly claimed by another worker.`);
            return;
        }

        console.log(`Successfully claimed task ${task.task_id}. Starting processing...`);

        // 3. Verwerk de taak (OpenAI call)
        await processTask(task);

    } catch (error) {
        console.error(`Unhandled error during task polling/claiming for task ${task?.task_id || 'unknown'}:`, error);
        if (task) {
            // Probeer de taak als gefaald te markeren bij een onverwachte fout in de poll/claim logica
            try {
                await supabase
                    .from('async_tasks')
                    .update({ status: 'failed', error_message: `Worker error during poll/claim: ${error.message}`, finished_at: new Date().toISOString() })
                    .eq('task_id', task.task_id);
            } catch (failUpdateError) {
                console.error(`Failed to mark task ${task.task_id} as failed after worker error:`, failUpdateError);
            }
        }
    } finally {
        // Plan de volgende poll, ongeacht succes of falen van deze ronde
        setTimeout(pollForTasks, pollInterval);
    }
}

// --- Taak Verwerkingsfunctie ---
async function processTask(task) {
    const { task_id, idea, model } = task;
    let recipeJsonString = null;
    let parsedRecipeObject = null;

    try {
        console.log(`[${task_id}] Calling OpenAI model ${model}...`);
        const prompt = `Genereer een creatief en uniek recept voor een broodje gebaseerd op het volgende idee: \"${idea}\". Het recept moet stapsgewijze instructies bevatten, een lijst van ingrediënten met hoeveelheden, en een aantrekkelijke naam voor het broodje. Output alleen de JSON structuur.\nDenk aan:\n- Originele combinaties\n- Duidelijke stappen\n- Geschikte hoeveelheden voor 1 persoon\n- Een pakkende naam\n\nOutput formaat (alleen JSON):\n{\n  \"naam\": \"...\",\n  \"beschrijving\": \"...\",\n  \"ingredienten\": [ { \"naam\": \"...\", \"hoeveelheid\": \"...\" } ],\n  \"instructies\": [ \"stap 1...\", \"stap 2...\" ]\n}\n`;

        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            response_format: { type: "json_object" },
        });

        recipeJsonString = completion.choices[0]?.message?.content?.trim();
        if (!recipeJsonString) {
            throw new Error('OpenAI response content is empty or missing.');
        }
        console.log(`[${task_id}] Received response from OpenAI.`);

        // Valideer JSON
        try {
            parsedRecipeObject = JSON.parse(recipeJsonString);
        } catch (jsonError) {
            console.error(`[${task_id}] OpenAI response is not valid JSON. Response:`, recipeJsonString);
            throw new Error('OpenAI did not return valid JSON.');
        }

        // Succes: Update naar completed
        console.log(`[${task_id}] Task completed successfully. Updating status.`);
        const { error: completeError } = await supabase
            .from('async_tasks')
            .update({ status: 'completed', recipe: recipeJsonString, finished_at: new Date().toISOString(), error_message: null })
            .eq('task_id', task_id);

        if (completeError) {
            console.error(`[${task_id}] Error updating task status to completed:`, completeError);
            // Wat hier te doen? De taak is technisch gelukt, maar DB update faalt. Mogelijk later opnieuw proberen?
        } else {
            console.log(`[${task_id}] Status updated to completed.`);
        }

    } catch (processingError) {
        console.error(`[${task_id}] Error during OpenAI call/processing:`, processingError);
        // Falen: Update naar failed
        const { error: failError } = await supabase
            .from('async_tasks')
            .update({ status: 'failed', error_message: processingError.message || 'Unknown error during processing', finished_at: new Date().toISOString() })
            .eq('task_id', task_id);

        if (failError) {
            console.error(`[${task_id}] Error updating task status to failed:`, failError);
        } else {
            console.log(`[${task_id}] Status updated to failed.`);
        }
    }
}

// --- Start de eerste poll ---
pollForTasks();
