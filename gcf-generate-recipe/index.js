const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Retrieve secrets from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Validate that environment variables are set
if (!supabaseUrl || !supabaseAnonKey || !openaiApiKey) {
    console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY');
    // Optionally, throw an error during initialization phase
    // throw new Error('Missing required environment variables');
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: openaiApiKey,
});

/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Functions request context.
 * @param {Object} res Cloud Functions response context.
 */
functions.http('generateRecipe', async (req, res) => {
    // Set CORS headers for preflight requests
    // Allows POSTs from any origin with the Content-Type header
    // and caches preflight results for 3600s
    res.set('Access-Control-Allow-Origin', '*'); // TODO: Restrict this to your frontend domain in production
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');

    if (req.method === 'OPTIONS') {
        // Send response to OPTIONS requests
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // Check if clients initialized properly (in case initialization failed silently earlier)
    if (!supabase || !openai) {
        console.error('Supabase or OpenAI client not initialized. Check environment variables.');
        return res.status(500).json({ error: 'Internal server configuration error.' });
    }

    console.log('Received request body:', req.body);

    // --- Input Extraction and Validation ---
    const { ingredients, type, language } = req.body;

    if (!ingredients || typeof ingredients !== 'string' || ingredients.trim() === '') {
        console.error('Invalid input: Missing or empty ingredients.');
        return res.status(400).json({ error: 'Ingredients are required and must be a non-empty string.' });
    }

    if (!type || typeof type !== 'string' || type.trim() === '') {
        console.error('Invalid input: Missing or empty type.');
        return res.status(400).json({ error: 'Type is required and must be a non-empty string.' });
    }

    const validatedLanguage = (language && typeof language === 'string' && language.trim() !== '') ? language : 'Nederlands'; // Default to Dutch if not provided or invalid
    // --- End Input Validation ---

    let taskId = null; // Initialize taskId

    // --- (Optional) Create Initial Task in Supabase ---
    try {
        console.log('Creating initial task record in Supabase...');
        const { data: taskData, error: taskError } = await supabase
            .from('tasks')
            .insert({
                user_prompt: JSON.stringify({ ingredients, type, language: validatedLanguage }), // Store original request
                status: 'processing',
                // Add other relevant fields if necessary, e.g., user_id if available
            })
            .select('id') // Select the generated ID
            .single(); // Expecting a single record insertion

        if (taskError) {
            throw taskError; // Re-throw Supabase specific error
        }

        if (!taskData || !taskData.id) {
            throw new Error('Failed to create task or retrieve task ID from Supabase.');
        }

        taskId = taskData.id;
        console.log(`Successfully created task with ID: ${taskId}`);

    } catch (dbError) {
        console.error('Database Error: Failed to create initial task record:', dbError);
        // Stop processing if we can't even create the initial task record
        return res.status(500).json({ error: 'Failed to initialize task processing.', details: dbError.message });
    }
    // --- End Initial Task Creation ---


    try {
        // Pass taskId to the core processing logic if needed for updates
        console.log(`Starting OpenAI generation for task ID: ${taskId}`);

        // --- Call OpenAI API ---
        const systemPrompt = `Je bent een expert in het bedenken van recepten. Genereer een recept gebaseerd op de volgende input. Geef ALLEEN een JSON-object terug met de volgende structuur: {"title": "Recept Titel", "description": "Korte omschrijving", "ingredients": [{"name": "Ingrediënt naam", "quantity": "Hoeveelheid (bv. 100g, 2 stuks)"}], "instructions": ["Stap 1", "Stap 2", ...]}. Gebruik de taal: ${validatedLanguage}.`;
        const userPrompt = `Ingrediënten: ${ingredients}. Type gerecht: ${type}. Taal: ${validatedLanguage}.`;

        console.log('Sending request to OpenAI...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Or "gpt-4o" for higher quality but potentially slower response
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.7, // Adjust creativity
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

        // --- Validate OpenAI Response Structure ---
        console.log('Validating OpenAI response structure...');
        if (typeof recipeResultJson !== 'object' || recipeResultJson === null) {
            throw new Error('OpenAI response is not a valid object.');
        }

        const { title, description, ingredients: recipeIngredients, instructions } = recipeResultJson;

        if (typeof title !== 'string' || title.trim() === '') {
            throw new Error('OpenAI response missing or invalid title.');
        }
        if (typeof description !== 'string') { // Allow empty description
            throw new Error('OpenAI response missing or invalid description.');
        }
        if (!Array.isArray(recipeIngredients)) {
            throw new Error('OpenAI response missing or invalid ingredients array.');
        }
        if (!Array.isArray(instructions)) {
            throw new Error('OpenAI response missing or invalid instructions array.');
        }

        // Optional: Deeper validation of array contents
        // e.g., check if recipeIngredients contains objects with name/quantity strings
        // e.g., check if instructions contains strings

        console.log('OpenAI response structure validation passed.');
        // --- End OpenAI Response Validation ---

        // --- (Optional) Update Task Status: Success ---
        await updateTaskStatus(taskId, 'completed', recipeResultJson);
        // --- End Task Update ---

        const finalResponse = {
            taskId: taskId,
            recipe: recipeResultJson, // Send the validated JSON object
        };

        console.log('Sending success response:', finalResponse);
        res.status(200).json(finalResponse);

    } catch (error) {
        console.error(`Error processing request for task ID ${taskId}:`, error);

        // --- (Optional) Update Task Status: Error ---
        // Attempt to update status even if main processing failed
        await updateTaskStatus(taskId, 'error', { message: error.message });
        // --- End Task Update ---

        res.status(500).json({ error: 'Failed to generate recipe.', details: error.message, taskId: taskId }); // Include taskId in error response
    }
});

// --- Helper function for updating task status ---
async function updateTaskStatus(taskId, status, resultOrError) {
    if (!taskId) {
        console.log('No taskId provided, skipping status update.');
        return;
    }
    try {
        const updatePayload = {
            status: status,
            ended_at: new Date().toISOString(),
            ...(status === 'completed' && { result: resultOrError }),
            ...(status === 'error' && { error_details: resultOrError }),
        };
        console.log(`Attempting to update task ${taskId} to status: ${status}`);
        const { error } = await supabase
            .from('tasks')
            .update(updatePayload)
            .eq('id', taskId);

        if (error) {
            console.error(`Failed to update task ${taskId} status to ${status}:`, error);
            // Don't re-throw here, as the main operation might have succeeded/failed already
        } else {
            console.log(`Successfully updated task ${taskId} status to ${status}`);
        }
    } catch (updateError) {
        // Catch errors during the update process itself
        console.error(`Exception while updating task ${taskId} status to ${status}:`, updateError);
    }
}
