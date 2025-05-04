const { getServiceClient } = require('./lib/supabaseClient');
const { getOpenAIClient } = require('./lib/openaiClient');

exports.handler = async (event, context) => {
    // Allow OPTIONS requests for CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*', // TODO: Restrict in production
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '3600',
            },
            body: '',
        };
    }

    // We only accept POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Check if clients initialized properly via shared modules
    const supabase = getServiceClient();
    const openai = getOpenAIClient();
    if (!supabase || !openai) {
        console.error('generateRecipe: Supabase or OpenAI client not initialized. Check Netlify environment variables.');
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal server configuration error.' })
        };
    }

    let taskId = null; // To store the ID of the created task

    try {
        // --- Input Extraction and Validation ---
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            console.error("Failed to parse request body:", e);
            return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Invalid request body.' }) };
        }

        console.log('Received request body:', body);
        const { ingredients, type, language, model } = body;

        if (!ingredients || typeof ingredients !== 'string' || ingredients.trim() === '') {
            return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Ingredients are required.' }) };
        }
        if (!type || typeof type !== 'string' || type.trim() === '') {
            return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Type is required.' }) };
        }
        const validatedLanguage = language || 'Nederlands';
        const requestedModel = model || "gpt-4o-mini";
        const modelToUse = ["gpt-4o", "gpt-4o-mini"].includes(requestedModel) ? requestedModel : "gpt-4o-mini";
        // --- End Input Validation ---

        console.log(`Starting OpenAI generation for: ${ingredients}`);

        // --- Call OpenAI API ---
        const systemPrompt = `Je bent een expert in het bedenken van recepten. Genereer een recept gebaseerd op de volgende input. Geef ALLEEN een JSON-object terug met de volgende structuur: {"title": "Recept Titel", "description": "Korte omschrijving", "ingredients": [{"name": "Ingrediënt naam", "quantity": "Hoeveelheid (bv. 100g, 2 stuks)"}], "instructions": ["Stap 1", "Stap 2", ...]}. Gebruik de taal: ${validatedLanguage}.`;
        const userPrompt = `Ingrediënten: ${ingredients}. Type gerecht: ${type}. Taal: ${validatedLanguage}.`;

        console.log(`Using OpenAI model: ${modelToUse}`);
        const completion = await openai.chat.completions.create({
            model: modelToUse,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            response_format: { type: "json_object" },
        });

        console.log('Received OpenAI response.');
        const aiResponseContent = completion.choices[0]?.message?.content;

        if (!aiResponseContent) {
            throw new Error('OpenAI response did not contain content.');
        }

        // Parse the JSON response from OpenAI
        let recipeResultJson;
        try {
            recipeResultJson = JSON.parse(aiResponseContent);
            console.log('Successfully parsed OpenAI JSON response.');
        } catch (parseError) {
            console.error('Failed to parse OpenAI JSON response:', aiResponseContent);
            throw new Error('OpenAI did not return valid JSON.');
        }
        // --- End OpenAI API Call ---

        // --- Validate OpenAI Response Structure (Basic) ---
        if (typeof recipeResultJson !== 'object' || recipeResultJson === null || !recipeResultJson.title || !Array.isArray(recipeResultJson.ingredients) || !Array.isArray(recipeResultJson.instructions)) {
            console.error("Invalid OpenAI response structure:", recipeResultJson);
            throw new Error('OpenAI response has invalid structure.');
        }
        // --- End Validation ---


        // --- Insert COMPLETE Task into Supabase ---
        console.log('Inserting generated recipe into async_tasks table...');
        const { data: insertData, error: insertError } = await supabase
            .from('async_tasks')
            .insert({
                idea: ingredients, // Store the original prompt
                status: 'completed', // Mark as completed directly
                model: modelToUse,
                recipe: JSON.stringify(recipeResultJson), // Store the generated recipe JSON string
                // started_at and created_at will be set automatically by DB defaults
                // cost_breakdown and cost_calculation_type will be filled later by getCostBreakdown
            })
            .select('task_id') // Select the generated task_id
            .single();

        if (insertError) {
            console.error('Database Error: Failed to insert completed task record:', insertError);
            throw new Error(`Database error saving result: ${insertError.message}`);
        }

        if (!insertData || !insertData.task_id) {
            throw new Error('Failed to insert task or retrieve task ID from Supabase after insert.');
        }

        taskId = insertData.task_id;
        console.log(`Successfully inserted task with ID: ${taskId}`);
        // --- End DB Insert ---

        // --- Prepare and Send Success Response ---
        const finalResponse = {
            taskId: taskId,
            recipe: recipeResultJson, // Send the parsed JSON object back
        };

        console.log('Sending success response:', finalResponse);
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Add CORS header
                'Content-Type': 'application/json' // Add Content-Type header
            },
            body: JSON.stringify(finalResponse),
        };
        // --- End Success ---

    } catch (error) {
        // Verbeterde Logging
        const errorTimestamp = new Date().toISOString();
        console.error(`[${errorTimestamp}] Error in generateRecipe handler:`, error.message);
        console.error(`[${errorTimestamp}] Task ID at time of error:`, taskId); // Log taskId if available
        console.error(`[${errorTimestamp}] Full Error:`, error); // Log full error object for stack trace etc.

        // Poging tot update status (bestaande logica)
        if (taskId) {
            try {
                // Gebruik getServiceClient hier ook, want supabase variabele is mogelijk niet gezet in de catch scope
                const dbClient = getServiceClient();
                if (dbClient) {
                    await dbClient.from('async_tasks').update({ status: 'error', error_message: error.message }).eq('task_id', taskId);
                } else {
                    console.error(`[${errorTimestamp}] Could not update task ${taskId} status: Supabase client unavailable.`);
                }
            } catch (updateErr) {
                console.error(`[${errorTimestamp}] Failed to update task ${taskId} status to error:`, updateErr);
            }
        }

        // Gestandaardiseerde Error Response
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to generate recipe due to an internal server error.';

        if (error.message?.includes('OpenAI') || error.message?.includes('AI')) {
            statusCode = 502; // Bad Gateway for external service failure
            errorCode = "AI_GENERATION_FAILED";
            userMessage = 'Error communicating with AI service.';
        } else if (error.message?.includes('Database error') || error.message?.includes('Supabase')) {
            errorCode = "DATABASE_ERROR";
            userMessage = 'A database error occurred while processing the recipe.';
        } else if (error.message?.includes('Invalid JSON') || error.message?.includes('parse')) {
            statusCode = 400; // Bad Request if input parsing failed early (though unlikely here)
            errorCode = "INVALID_INPUT";
            userMessage = 'Invalid data received.';
        }

        return {
            statusCode: statusCode,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                error: {
                    message: userMessage,
                    code: errorCode,
                    details: error.message // Include original message as detail
                },
                taskId: taskId // Include taskId if available
            }),
        };
    }
};
