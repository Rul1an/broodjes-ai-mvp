const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Retrieve secrets from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY; // Use Service Key
const openaiApiKey = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
let openai;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log('generateRecipe (Netlify): OpenAI client initialized.');
} else {
    console.error('CRITICAL: Missing OPENAI_API_KEY in Netlify environment.');
    // The function will likely fail later if OpenAI is needed
}

// Initialize Supabase client
let supabase;
if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('generateRecipe (Netlify): Supabase client initialized with Service Key.');
} else {
    console.error('CRITICAL: Missing SUPABASE_URL or SERVICE_ROLE_KEY in Netlify environment.');
}

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

    // Check if clients initialized properly
    if (!supabase || !openai) {
        console.error('Supabase or OpenAI client not initialized. Check Netlify environment variables.');
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }, // Add CORS header for error response too
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
            headers: { 'Access-Control-Allow-Origin': '*' }, // Add CORS header
            body: JSON.stringify(finalResponse),
        };
        // --- End Success ---

    } catch (error) {
        console.error(`Error processing generateRecipe request:`, error);
        // Optionally attempt to update task status to 'error' if taskId was generated before failure
        if (taskId) {
            try {
                await supabase.from('async_tasks').update({ status: 'error', error_message: error.message }).eq('task_id', taskId);
            } catch (updateErr) {
                console.error(`Failed to update task ${taskId} status to error:`, updateErr);
            }
        }
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to generate recipe.', details: error.message, taskId: taskId }),
        };
    }
};
