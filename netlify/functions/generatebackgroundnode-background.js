const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// Helper function to update Supabase task status and result
async function updateSupabaseTask(supabase, taskId, updateData) {
    const { data, error } = await supabase
        .from('async_tasks')
        .update(updateData)
        .eq('task_id', taskId)
        .select(); // Select to confirm the update

    if (error) {
        console.error(`Error updating task ${taskId} in Supabase:`, error);
        // Decide if you need to throw or just log
    }
    return { data, error };
}

exports.handler = async function (event, context) {
    // --- VERY FIRST ACTION: Try to get task_id and update status ---
    let taskId = 'unknown';
    let initialPayload;
    let supabase;

    try {
        if (!event.body) {
            console.error('[generatebackgroundnode-background] EARLY CHECK: Event body is missing.');
            return { statusCode: 400 };
        }
        initialPayload = JSON.parse(event.body);
        taskId = initialPayload?.task_id;

        if (!taskId) {
            console.error('[generatebackgroundnode-background] EARLY CHECK: Task ID missing in payload.', event.body);
            return { statusCode: 400 };
        }

        console.log(`[generatebackgroundnode-background] Function START for task: ${taskId}.`); // Moved log here

        // Initialize Supabase Client EARLY
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            console.error('[generatebackgroundnode-background] EARLY CHECK: Missing Supabase environment variables.');
            // Don't update status if we can't connect
            return { statusCode: 500 };
        }
        supabase = createClient(supabaseUrl, supabaseKey);

        // --- ATTEMPT IMMEDIATE STATUS UPDATE ---
        console.log(`[generatebackgroundnode-background] Attempting immediate status update to 'processing' for task ${taskId}.`);
        const { error: updateError } = await updateSupabaseTask(supabase, taskId, {
            status: 'processing',
            started_at: new Date().toISOString()
        });

        if (updateError) {
            console.error(`[generatebackgroundnode-background] FAILED immediate status update for task ${taskId}:`, updateError);
            // If we can't even update status, something is very wrong. Exit.
            return { statusCode: 500 };
        }
        console.log(`[generatebackgroundnode-background] Successfully updated status to 'processing' for task ${taskId}.`);

    } catch (earlyError) {
        console.error(`[generatebackgroundnode-background] Error during initial processing/status update for task ${taskId}:`, earlyError);
        // Attempt to mark as failed if we have supabase and taskId
        if (supabase && taskId !== 'unknown') {
            try {
                await updateSupabaseTask(supabase, taskId, {
                    status: 'failed',
                    error_message: `Failed during initial processing: ${earlyError.message}`,
                    finished_at: new Date().toISOString()
                });
            } catch (failLogError) {
                console.error(`[generatebackgroundnode-background] Also failed to log initial failure for task ${taskId}:`, failLogError);
            }
        }
        return { statusCode: 500 };
    }

    // --- CONTINUE WITH NORMAL LOGIC (Now that status is processing) ---
    try {
        // Clients are already initialized if we reached here
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            console.error('[generatebackgroundnode-background] Missing OpenAI Key env var.');
            throw new Error('OpenAI API Key missing.'); // Let outer catch handle failure update
        }
        const openai = new OpenAI({ apiKey: openaiApiKey });
        console.log(`[generatebackgroundnode-background] OpenAI client initialized.`);

        const { idea, model } = initialPayload; // Use payload parsed earlier

        // --- Call OpenAI ---
        console.log(`[generatebackgroundnode-background] Calling OpenAI model ${model} for task ${taskId}...`);
        const prompt = `Genereer een creatief en uniek recept voor een broodje gebaseerd op het volgende idee: "${idea}". Het recept moet stapsgewijze instructies bevatten, een lijst van ingrediënten met hoeveelheden, en een aantrekkelijke naam voor het broodje. Output alleen de JSON structuur.
        Denk aan:
        - Originele combinaties
        - Duidelijke stappen
        - Geschikte hoeveelheden voor 1 persoon
        - Een pakkende naam

        Output formaat (alleen JSON):
        {
          "naam": "...",
          "beschrijving": "...",
          "ingredienten": [ { "naam": "...", "hoeveelheid": "..." } ],
          "instructies": [ "stap 1...", "stap 2..." ]
        }
        `;

        let recipeJsonString;
        try {
            const completion = await openai.chat.completions.create({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                response_format: { type: "json_object" }, // Vraag expliciet JSON output
            });

            recipeJsonString = completion.choices[0]?.message?.content?.trim();
            if (!recipeJsonString) {
                throw new Error('OpenAI response content is empty or missing.');
            }
            console.log(`[generatebackgroundnode-background] Received response from OpenAI for task ${taskId}.`);

            // Validate if it's valid JSON before updating Supabase
            try {
                JSON.parse(recipeJsonString);
            } catch (jsonError) {
                console.error(`[generatebackgroundnode-background] OpenAI response is not valid JSON for task ${taskId}. Response:`, recipeJsonString);
                throw new Error('OpenAI did not return valid JSON.');
            }

            // --- Update Supabase Task Record - Success ---
            console.log(`[generatebackgroundnode-background] Updating task ${taskId} status to completed.`);
            await updateSupabaseTask(supabase, taskId, {
                status: 'completed',
                recipe: recipeJsonString,
                finished_at: new Date().toISOString()
            });
            console.log(`[generatebackgroundnode-background] Task ${taskId} successfully completed.`);

        } catch (openaiError) {
            console.error(`[generatebackgroundnode-background] Error during OpenAI call/processing for task ${taskId}:`, openaiError);
            // Throw the error to be caught by the outer catch, which will mark as failed
            throw openaiError;
        }

        console.log(`[generatebackgroundnode-background] Function END normally for task ${taskId}.`);
        return { statusCode: 200 };

    } catch (processingError) {
        // --- CATCH ERRORS AFTER INITIAL STATUS UPDATE ---
        console.error(`[generatebackgroundnode-background] Error during main processing for task ${taskId}:`, processingError);
        // Update status to failed using existing supabase client and taskId
        await updateSupabaseTask(supabase, taskId, {
            status: 'failed',
            error_message: processingError.message || 'Unknown error during processing',
            finished_at: new Date().toISOString()
        });
        return { statusCode: 500 };
    }
};
