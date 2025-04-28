// Serverless function to start the background recipe generation task
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

// Helper function to update Supabase task status and result (simplified)
async function updateTask(supabase, taskId, updateData) {
    console.log(`[generate-start] Updating task ${taskId} status to: ${updateData.status}`);
    const { data, error } = await supabase
        .from('async_tasks')
        .update(updateData)
        .eq('task_id', taskId)
        .select(); // Select to confirm the update

    if (error) {
        // Log error but don't necessarily stop the main flow if it's just logging
        console.error(`[generate-start] Error updating task ${taskId} in Supabase:`, error);
    }
    return { data, error };
}

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    let body;
    let supabase; // Define supabase in the outer scope
    let taskId = 'unknown'; // Define taskId in the outer scope

    try {
        // Parse and validate request body
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        body = JSON.parse(event.body);

        const idea = body.idea;
        const requestedModel = body.model || 'gpt-3.5-turbo'; // Default model

        // Validate idea input
        if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Parameter "idea" must be a non-empty string.' }),
            };
        }

        // Validate model input
        const allowedModels = ['gpt-3.5-turbo', 'gpt-4o'];
        if (!allowedModels.includes(requestedModel)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `Unsupported model: ${requestedModel}` }),
            };
        }

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('[generate-start] Supabase URL or SERVICE_ROLE_KEY missing');
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'failed', error: 'Server configuration error (Supabase creds)' })
            };
        }
        supabase = createClient(supabaseUrl, supabaseKey);

        // Initialize OpenAI Client
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            console.error('[generate-start] Missing OpenAI Key env var.');
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'failed', error: 'Server configuration error (OpenAI key)' })
            };
        }
        const openai = new OpenAI({ apiKey: openaiApiKey });
        console.log('[generate-start] Supabase and OpenAI clients initialized.');

        // Generate a unique task ID for this job
        taskId = uuidv4();
        console.log(`[generate-start] Starting process for task: ${taskId}`);

        // Create a task record in Supabase - initially pending, immediately updated to processing
        const { error: insertError } = await supabase
            .from('async_tasks')
            .insert([{
                task_id: taskId,
                idea: idea.trim(),
                model: requestedModel,
                status: 'pending', // Insert as pending first
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (insertError) {
            console.error(`[generate-start] Error creating initial task record for ${taskId}:`, insertError);
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'failed', error: 'Failed to create task record' })
            };
        }

        // Immediately update status to processing
        await updateTask(supabase, taskId, {
            status: 'processing',
            started_at: new Date().toISOString()
        });

        // --- Call OpenAI ---
        console.log(`[generate-start] Calling OpenAI model ${requestedModel} for task ${taskId}...`);
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
        let parsedRecipeObject;

        try {
            const completion = await openai.chat.completions.create({
                model: requestedModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                response_format: { type: "json_object" }, // Vraag expliciet JSON output
            });

            recipeJsonString = completion.choices[0]?.message?.content?.trim();
            if (!recipeJsonString) {
                throw new Error('OpenAI response content is empty or missing.');
            }
            console.log(`[generate-start] Received response from OpenAI for task ${taskId}.`);

            // Validate if it's valid JSON before updating Supabase
            try {
                parsedRecipeObject = JSON.parse(recipeJsonString);
            } catch (jsonError) {
                console.error(`[generate-start] OpenAI response is not valid JSON for task ${taskId}. Response:`, recipeJsonString);
                throw new Error('OpenAI did not return valid JSON.');
            }

            // --- Update Supabase Task Record - Success ---
            await updateTask(supabase, taskId, {
                status: 'completed',
                recipe: recipeJsonString, // Store the raw JSON string
                finished_at: new Date().toISOString()
            });
            console.log(`[generate-start] Task ${taskId} successfully completed.`);

            // --- Return Processed Recipe --- (No need to fetch costs here, keep it simple)
            return {
                statusCode: 200,
                body: JSON.stringify({
                    status: 'completed',
                    recipe: parsedRecipeObject // Return the parsed recipe object
                })
            };

        } catch (openaiError) {
            console.error(`[generate-start] Error during OpenAI call/processing for task ${taskId}:`, openaiError);
            // Update status to failed
            await updateTask(supabase, taskId, {
                status: 'failed',
                error_message: openaiError.message || 'Unknown error during OpenAI processing',
                finished_at: new Date().toISOString()
            });
            // Return error to the client
            return {
                statusCode: 500, // Internal Server Error seems appropriate
                body: JSON.stringify({
                    status: 'failed',
                    error: `Recipe generation failed: ${openaiError.message}`
                })
            };
        }

    } catch (error) {
        console.error(`[generate-start] Outer catch error for task ${taskId}:`, error);
        // Attempt to mark as failed if possible (if supabase & taskId are available)
        if (supabase && taskId !== 'unknown') {
            try {
                await updateTask(supabase, taskId, {
                    status: 'failed',
                    error_message: `Outer catch: ${error.message}`,
                    finished_at: new Date().toISOString()
                });
            } catch (failLogError) {
                console.error(`[generate-start] Also failed to log outer failure for task ${taskId}:`, failLogError);
            }
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'failed', error: `Server error: ${error.message}` })
        };
    }
};
