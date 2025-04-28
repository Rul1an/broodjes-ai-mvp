const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// Helper function to update Supabase task status
async function updateSupabaseTask(supabase, taskId, updateData) {
    console.log(`[Node Background] Attempting to update task ${taskId} with status ${updateData.status}`);
    try {
        const { error } = await supabase
            .from('async_tasks')
            .update(updateData)
            .eq('task_id', taskId);

        if (error) {
            console.error(`[Node Background] CRITICAL: Failed to update task ${taskId} status to ${updateData.status} in Supabase:`, error);
            // Log the error but don't throw, as the main function might have already returned
        } else {
            console.log(`[Node Background] Task ${taskId} status updated to ${updateData.status} in Supabase.`);
        }
    } catch (updateError) {
        // Catch potential errors within the update logic itself
        console.error(`[Node Background] Exception during Supabase update for task ${taskId}:`, updateError);
    }
}


exports.handler = async function (event, context) {
    console.log('[Node Background] Handler invoked.');

    // 1. Check if it's a POST request (though invoked internally, good practice)
    if (event.httpMethod !== 'POST') {
        console.warn('[Node Background] Received non-POST request.');
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 2. Initialize Clients
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SERVICE_ROLE_KEY; // Use Service Role Key
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
        console.error('[Node Background] Missing required environment variables (Supabase URL/Service Key or OpenAI Key).');
        // We can't update the task status if Supabase keys are missing, so just return error.
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // 3. Parse Payload
    let payload;
    try {
        if (!event.body) {
            console.error('[Node Background] Request body is missing.');
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        payload = JSON.parse(event.body);
        const { task_id, idea, model } = payload;

        if (!task_id || !idea || !model) {
            console.error('[Node Background] Missing required fields in payload:', { task_id, idea, model });
            // We might not have a task_id to update, so return 400
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields (task_id, idea, model)' }) };
        }

        console.log(`[Node Background] Processing task ${task_id} for idea: '${idea}' with model ${model}`);

        // 4. Call OpenAI (Main logic in try block)
        try {
            const prompt = `
Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '${idea}'.
Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
Beschrijf de bereidingsstappen duidelijk en beknopt.
Houd het recept praktisch en gericht op een snelle bereiding.
Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
Bevat GEEN json block aan het einde van je antwoord.
            `;

            const chatCompletion = await openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: model,
            });

            let recipe = chatCompletion.choices[0]?.message?.content || '';

            // Cleanup response string (remove potential JSON block)
            const jsonMarker = '```json';
            const jsonIndex = recipe.indexOf(jsonMarker);
            if (jsonIndex !== -1) {
                recipe = recipe.substring(0, jsonIndex).trim();
            }

            console.log(`[Node Background] OpenAI call successful for task ${task_id}.`);

            // 5. Update Supabase Task Record - Success
            await updateSupabaseTask(supabase, task_id, {
                status: 'completed',
                recipe: recipe,
                updated_at: new Date().toISOString() // Also update timestamp
            });

            // Return 200 OK for the handler itself upon success
            return { statusCode: 200, body: JSON.stringify({ message: 'Background task completed successfully.' }) };

        } catch (openaiError) {
            // 6. Handle OpenAI or processing errors
            console.error(`[Node Background] Error during OpenAI call or processing for task ${task_id}:`, openaiError);
            const errorMessage = openaiError.message || 'Unknown error during background processing';

            // Attempt to update Supabase Task Record - Failed
            await updateSupabaseTask(supabase, task_id, {
                status: 'failed',
                error_message: errorMessage,
                updated_at: new Date().toISOString() // Also update timestamp
            });

            // Even if Supabase update fails, return 200 to the invoker,
            // as the error is logged and stored (attempted) in the DB.
            return { statusCode: 200, body: JSON.stringify({ message: 'Background task failed, status updated.' }) };
        }

    } catch (parseError) {
        // Handle errors during initial parsing or setup
        console.error('[Node Background] Error parsing request body or initial setup:', parseError);
        // Cannot reliably update task status if parsing failed early
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request format or setup error.' }) };
    }
};
