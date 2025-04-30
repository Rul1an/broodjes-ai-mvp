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
    const { ingredients, type, language, model } = req.body;

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
            .from('async_tasks')
            .insert({
                status: 'processing',
                model: model || null, // Use model from req.body
                idea: (typeof ingredients === 'string') ? ingredients : null, // Store raw ingredients input as idea?
                started_at: new Date().toISOString() // Set start time
            })
            .select('task_id')
            .single();

        if (taskError) {
            throw taskError; // Re-throw Supabase specific error
        }

        if (!taskData || !taskData.task_id) {
            throw new Error('Failed to create task or retrieve task ID from Supabase.');
        }

        taskId = taskData.task_id;
        console.log(`Successfully created task with ID: ${taskId}`);

    } catch (dbError) {
        console.error('Database Error: Failed to create initial task record:', dbError);
        // Use more specific error logging if possible
        const errorMessage = dbError.message || 'Unknown database error';
        const errorDetails = dbError.details || '';
        const errorHint = dbError.hint || '';
        console.error(`Supabase error details: ${errorMessage} ${errorDetails} ${errorHint}`);
        // Stop processing if we can't even create the initial task record
        return res.status(500).json({ error: 'Failed to initialize task processing.', details: errorMessage });
    }
    // --- End Initial Task Creation ---


    try {
        // Pass taskId to the core processing logic if needed for updates
        console.log(`Starting OpenAI generation for task ID: ${taskId}`);

        // --- Call OpenAI API ---
        const systemPrompt = `Je bent een expert in het bedenken van recepten. Genereer een recept gebaseerd op de volgende input. Geef ALLEEN een JSON-object terug met de volgende structuur: {"title": "Recept Titel", "description": "Korte omschrijving", "ingredients": [{"name": "Ingrediënt naam", "quantity": "Hoeveelheid (bv. 100g, 2 stuks)"}], "instructions": ["Stap 1", "Stap 2", ...]}. Gebruik de taal: ${validatedLanguage}.`;
        const userPrompt = `Ingrediënten: ${ingredients}. Type gerecht: ${type}. Taal: ${validatedLanguage}.`;

        // <<< Determine the model to use >>>
        const requestedModel = model || "gpt-4o-mini"; // Default to gpt-4o-mini if not provided
        // Add more validation if needed, e.g., check against a list of allowed models
        const modelToUse = ["gpt-4o", "gpt-4o-mini"].includes(requestedModel) ? requestedModel : "gpt-4o-mini";
        console.log(`Using OpenAI model: ${modelToUse}`);

        console.log('Sending request to OpenAI...');
        const completion = await openai.chat.completions.create({
            model: modelToUse, // <<< Use the dynamically determined model >>>
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

        // --- Save the generated recipe to the 'recipes' table ---
        let newRecipeId = null;
        try {
            console.log('Saving generated recipe to recipes table...');
            const { data: newRecipeData, error: insertRecipeError } = await supabase
                .from('recipes') // <<< Target the 'recipes' table
                .insert({
                    idea: ingredients, // Store the original user idea/input
                    generated_recipe: JSON.stringify(recipeResultJson) // Store the full recipe JSON as text
                    // created_at is usually handled by default value
                    // estimated_total_cost will be calculated later
                })
                .select('id') // Get the ID of the newly inserted recipe
                .single();

            if (insertRecipeError) {
                throw insertRecipeError;
            }
            if (!newRecipeData || !newRecipeData.id) {
                throw new Error('Failed to insert recipe or retrieve its ID.');
            }
            newRecipeId = newRecipeData.id;
            console.log(`Successfully saved recipe with ID: ${newRecipeId}`);

        } catch (saveError) {
            console.error('Failed to save recipe to recipes table:', saveError);
            // Decide if this error should stop the whole process or just be logged
            // For now, let's throw it to indicate failure to the user,
            // but still update the async_task to 'error'? Or maybe 'completed_save_failed'?
            // Let's update async_task to error and then re-throw.
            await updateTaskStatus(taskId, 'error', `Failed to save recipe: ${saveError.message}`);
            throw new Error(`Failed to save generated recipe: ${saveError.message}`);
        }
        // --- End saving recipe ---


        // --- (Optional) Update Task Status: Success ---
        // Update async_tasks status and link to the new recipe ID?
        // Adding recipe_id column to async_tasks might be useful.
        // For now, just mark as completed with the recipe string.
        await updateTaskStatus(taskId, 'completed', JSON.stringify(recipeResultJson));
        // --- End Task Update ---

        const finalResponse = {
            taskId: taskId,
            recipeId: newRecipeId, // <<< Add the new recipe ID to the response
            recipe: recipeResultJson, // Send the parsed JSON object back to frontend
        };

        console.log('Sending success response:', finalResponse);
        res.status(200).json(finalResponse);

    } catch (error) {
        console.error(`Error processing request for task ID ${taskId}:`, error);

        // --- (Optional) Update Task Status: Error ---
        // Update with error message in 'error_message' column based on schema
        await updateTaskStatus(taskId, 'error', error.message);
        // --- End Task Update ---

        res.status(500).json({ error: 'Failed to generate recipe.', details: error.message, taskId: taskId }); // Include taskId in error response
    }
});

// --- Helper function for updating task status ---
async function updateTaskStatus(taskId, status, resultOrErrorString) {
    if (!taskId) {
        console.log('No task_id provided, skipping status update.');
        return;
    }
    try {
        const updatePayload = {
            status: status,
            updated_at: new Date().toISOString(),
            ...(status === 'completed' && { recipe: resultOrErrorString }),
            ...(status === 'error' && { error_message: resultOrErrorString }),
        };
        // Remove null/undefined fields from payload to avoid overwriting existing values unintentionally
        Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);

        console.log(`Attempting to update task ${taskId} to status: ${status}`);
        const { error } = await supabase
            .from('async_tasks')
            .update(updatePayload)
            .eq('task_id', taskId);

        if (error) {
            console.error(`Failed to update task ${taskId} status to ${status}:`, error);
        } else {
            console.log(`Successfully updated task ${taskId} status to ${status}`);
        }
    } catch (updateError) {
        console.error(`Exception while updating task ${taskId} status to ${status}:`, updateError);
    }
}
