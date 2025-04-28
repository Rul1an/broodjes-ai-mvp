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
    // --- TOP LEVEL LOG ---
    console.log(`[generatebackgroundnode-background] Function START.`);

    // --- TOP LEVEL TRY/CATCH ---
    try {
        // Only process POST requests expected from generate-start
        if (event.httpMethod !== 'POST') {
            console.log(`[generatebackgroundnode-background] Received non-POST request: ${event.httpMethod}`);
            // Background functions don't strictly need to return, but good practice
            return { statusCode: 405 };
        }

        // --- Initialize Clients ---
        console.log(`[generatebackgroundnode-background] Initializing clients...`);
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SERVICE_ROLE_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;

        if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
            console.error('[generatebackgroundnode-background] Missing required environment variables (Supabase URL/Key or OpenAI Key).');
            // No point continuing if keys are missing
            return { statusCode: 500 };
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: openaiApiKey });
        console.log(`[generatebackgroundnode-background] Clients initialized.`);

        // --- Parse Payload ---
        let payload;
        try {
            if (!event.body) {
                console.error('[generatebackgroundnode-background] Event body is missing.');
                return { statusCode: 400 }; // Bad Request
            }
            payload = JSON.parse(event.body);
            console.log(`[generatebackgroundnode-background] Parsed payload for task: ${payload.task_id}`);
        } catch (parseError) {
            console.error('[generatebackgroundnode-background] Error parsing event body:', parseError);
            return { statusCode: 400 }; // Bad Request
        }

        const { task_id, idea, model } = payload;

        if (!task_id || !idea || !model) {
            console.error(`[generatebackgroundnode-background] Missing task_id, idea, or model in payload. Task ID: ${task_id}`);
            await updateSupabaseTask(supabase, task_id, { status: 'failed', error_message: 'Invalid payload received by background function.', finished_at: new Date().toISOString() });
            return { statusCode: 400 };
        }

        // --- Update Status to 'processing' ---
        console.log(`[generatebackgroundnode-background] Updating task ${task_id} status to processing.`);
        await updateSupabaseTask(supabase, task_id, { status: 'processing', started_at: new Date().toISOString() });

        // --- Call OpenAI ---
        console.log(`[generatebackgroundnode-background] Calling OpenAI model ${model} for task ${task_id}...`);
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
            console.log(`[generatebackgroundnode-background] Received response from OpenAI for task ${task_id}.`);

            // Validate if it's valid JSON before updating Supabase
            try {
                JSON.parse(recipeJsonString);
            } catch (jsonError) {
                console.error(`[generatebackgroundnode-background] OpenAI response is not valid JSON for task ${task_id}. Response:`, recipeJsonString);
                throw new Error('OpenAI did not return valid JSON.');
            }

            // --- Update Supabase Task Record - Success ---
            console.log(`[generatebackgroundnode-background] Updating task ${task_id} status to completed.`);
            await updateSupabaseTask(supabase, task_id, {
                status: 'completed',
                result_data: recipeJsonString, // Store raw JSON string
                finished_at: new Date().toISOString()
            });
            console.log(`[generatebackgroundnode-background] Task ${task_id} successfully completed.`);

        } catch (openaiError) {
            console.error(`[generatebackgroundnode-background] Error during OpenAI call or processing for task ${task_id}:`, openaiError);
            // --- Update Supabase Task Record - Failure ---
            await updateSupabaseTask(supabase, task_id, {
                status: 'failed',
                error_message: openaiError.message || 'Unknown error during OpenAI processing',
                finished_at: new Date().toISOString()
            });
            return { statusCode: 500 }; // Indicate internal error
        }

        // Background functions typically don't need to return anything meaningful if successful
        console.log(`[generatebackgroundnode-background] Function END normally for task ${task_id}.`);
        return { statusCode: 200 };

    } catch (topLevelError) {
        // --- CATCH ALL ERRORS ---
        console.error('[generatebackgroundnode-background] TOP LEVEL CATCH: Unhandled error in background function:', topLevelError);

        // Attempt to update Supabase even in top-level catch, if task_id is available
        // Note: event.body might not be parsed here if the error happened early
        let taskIdFromError = 'unknown';
        try {
            if (event.body) {
                const potentialPayload = JSON.parse(event.body);
                taskIdFromError = potentialPayload.task_id || 'unknown_after_parse';

                const supabaseUrl = process.env.SUPABASE_URL;
                const supabaseKey = process.env.SERVICE_ROLE_KEY;
                if (supabaseUrl && supabaseKey && taskIdFromError !== 'unknown' && taskIdFromError !== 'unknown_after_parse') {
                    const supabase = createClient(supabaseUrl, supabaseKey);
                    await updateSupabaseTask(supabase, taskIdFromError, {
                        status: 'failed',
                        error_message: `Unhandled top-level error: ${topLevelError.message}`,
                        finished_at: new Date().toISOString()
                    });
                }
            }
        } catch (loggingError) {
            console.error('[generatebackgroundnode-background] Error trying to log failure to Supabase in top-level catch:', loggingError);
        }

        // Even if logging fails, return an error status
        return { statusCode: 500 };
    }
};
