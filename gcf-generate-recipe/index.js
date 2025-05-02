const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Retrieve secrets from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
let openai;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log('OpenAI client initialized for generateRecipe.');
} else {
    // Log an error or warning if OpenAI key is missing, as it's now needed for cost estimate
    console.error('CRITICAL: Missing OPENAI_API_KEY. Cannot provide initial cost estimates.');
    // Decide if the function should fail entirely without OpenAI
    // For now, it will proceed but AI estimate will fail
}

// Validate that environment variables are set
if (!supabaseUrl || !supabaseAnonKey) { // Keep Anon key for initial task creation if needed, or switch entirely to Service Key if preferred
    console.error('Missing required Supabase environment variables: SUPABASE_URL, SUPABASE_ANON_KEY');
}

// Initialize Supabase client (using Anon key for task creation initially)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

        // --- >>> NEW: Insert into 'recipes' table <<< ---
        try {
            console.log(`Inserting successful recipe into 'recipes' table...`);
            const { error: insertError } = await supabase
                .from('recipes')
                .insert({
                    idea: ingredients, // The original input string
                    generated_recipe: JSON.stringify(recipeResultJson) // The generated recipe JSON string
                    // estimated_total_cost: null // Add later if calculation logic is implemented
                });

            if (insertError) {
                // Log the error but don't stop the function; the user still gets the recipe
                console.error('Failed to insert recipe into \'recipes\' table:', insertError);
                // Optional: You could update the async_task with a warning or partial success status here
            } else {
                console.log('Successfully inserted recipe into \'recipes\' table.');
            }
        } catch (dbInsertError) {
            // Catch any unexpected errors during the insert
            console.error('Exception during recipe insertion into \'recipes\' table:', dbInsertError);
        }
        // --- >>> END: Insert into 'recipes' table <<< ---


        // --- (Optional) Update Task Status: Success ---
        await updateTaskStatus(taskId, 'completed', JSON.stringify(recipeResultJson));
        // --- End Task Update ---

        // --- >>> NEW: Get Initial AI Cost Estimate <<< ---
        let initialEstimatedCost = null;
        if (openai) { // Only if OpenAI client is initialized
            try {
                initialEstimatedCost = await getAICostEstimate(recipeResultJson);
                console.log(`Initial AI cost estimate: ${initialEstimatedCost}`);
            } catch (aiCostError) {
                console.error(`Failed to get initial AI cost estimate for task ${taskId}:`, aiCostError);
            }
        }
        // --- >>> END: Get Initial AI Cost Estimate <<< ---

        const finalResponse = {
            taskId: taskId,
            recipe: recipeResultJson, // Send the parsed JSON object back to frontend
            initialEstimatedCost: initialEstimatedCost // <<< ADD ESTIMATE TO RESPONSE
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

// --- >>> NEW: Helper function for AI Cost Estimation (similar to calculateCost) <<< ---
async function getAICostEstimate(recipeJson) {
    if (!openai) {
        console.error('Cannot estimate cost: OpenAI client not initialized.');
        return null;
    }
    if (!recipeJson || !recipeJson.ingredients || !Array.isArray(recipeJson.ingredients)) {
        console.error('Cannot estimate cost: Invalid recipe JSON format provided for AI estimation.');
        return null;
    }

    // Prepare ingredients list for the prompt
    const ingredientsList = recipeJson.ingredients.map(ing => `- ${ing.quantity || ''} ${ing.name || 'Unknown'}`).join('\n');

    const prompt = `
    Estimate the total cost in Euros (€) to prepare a recipe with the following ingredients based on average Dutch supermarket prices. Provide ONLY the numerical value (e.g., 4.50), without the currency symbol or any other text.

    Ingredients:
    ${ingredientsList}
    `;

    try {
        // console.log('Requesting initial AI cost estimation...'); // Optional: reduce logging for initial generation
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use a cost-effective model
            messages: [
                { role: "system", content: "You are an assistant that estimates recipe costs in Euros. Respond with ONLY the numerical cost value." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2, // Low temperature for factual estimation
            max_tokens: 10, // Limit response length
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        // console.log('Raw initial AI cost estimation response:', aiResponse); // Optional logging

        if (!aiResponse) {
            console.error('Initial AI cost estimation returned empty response.');
            return null;
        }

        // Attempt to parse the response as a float
        const estimatedCost = parseFloat(aiResponse.replace(',', '.')); // Handle comma decimals

        if (isNaN(estimatedCost)) {
            console.error(`Initial AI cost estimation did not return a valid number: "${aiResponse}"`);
            return null;
        }

        return estimatedCost;

    } catch (error) {
        console.error('Error calling OpenAI API for initial cost estimation:', error);
        return null;
    }
}
