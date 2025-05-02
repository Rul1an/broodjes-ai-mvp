const { getServiceClient } = require('./lib/supabaseClient');
const { getOpenAIClient } = require('./lib/openaiClient');
const { extractEstimatedCost } = require('./lib/costUtils');

// Keep local helper function for now, unless moved to costUtils

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Initialize clients using shared modules
    const supabase = getServiceClient();
    const openai = getOpenAIClient();

    // Combined check for both clients
    if (!supabase || !openai) {
        console.error('refineRecipe: Supabase or OpenAI client failed to initialize.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (clients)' }) };
    }

    let body;

    try {
        // --- Input Parsing and Validation ---
        try {
            if (!event.body) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
            }
            body = JSON.parse(event.body);
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON format in request body.' }) };
        }

        const { recipeId, refinementRequest } = body;

        // Validate recipeId
        if (!recipeId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameter: recipeId (should be task_id)' }) };
        }

        // Validate refinementRequest
        if (!refinementRequest || typeof refinementRequest !== 'string' || refinementRequest.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "refinementRequest" must be a non-empty string.' }) };
        }
        const trimmedRefinementRequest = refinementRequest.trim();
        // -----------------------------------

        // --- Fetch original recipe and breakdown from async_tasks ---
        console.log(`refineRecipe: Fetching task ${recipeId}`);
        const { data: taskData, error: taskError } = await supabase
            .from('async_tasks')
            .select('recipe, cost_breakdown') // Fetch recipe JSON and existing breakdown text
            .eq('task_id', recipeId)
            .maybeSingle();

        if (taskError) {
            console.error(`refineRecipe: Error fetching task ${recipeId}:`, taskError);
            throw new Error(`Database error fetching task: ${taskError.message}`);
        }
        if (!taskData || !taskData.recipe) {
            return { statusCode: 404, body: JSON.stringify({ error: `Task ${recipeId} not found or has no recipe data.` }) };
        }
        const originalRecipeJsonString = taskData.recipe;
        const existingBreakdownText = taskData.cost_breakdown || "Geen kosten opbouw beschikbaar."; // Fallback text
        // --- END Fetch ---

        // --- Prompt for Refinement (Updated) ---
        const prompt = `
        Origineel Recept (JSON formaat):
        --- START RECEPT ---
        ${originalRecipeJsonString}
        --- EINDE RECEPT ---

        Bestaande Kosten Opbouw:
        --- START KOSTEN ---
        ${existingBreakdownText}
        --- EINDE KOSTEN ---

        Verzoek Gebruiker: "${trimmedRefinementRequest}"

        Taak: Pas het originele recept aan volgens het verzoek van de gebruiker. Pas OOK de kosten opbouw aan zodat deze overeenkomt met het *aangepaste* recept. Geef het volledige, bijgewerkte recept EN de bijgewerkte kostenopbouw terug als één stuk platte tekst. Gebruik de volgende Markdown-achtige opmaak voor het GEHELE antwoord:

        # [Nieuwe Recept Titel]

        [Optionele korte beschrijving]

        ## Ingrediënten:
        - [Hoeveelheid] [Ingrediënt 1]
        - ...

        ## Bereiding:
        1. [Stap 1]
        - ...

        ## Geschatte Tijd:
        - [Tijd]

        ## Geschatte Kosten Opbouw:
        - [Ingrediënt A] ([Hoeveelheid]): €X.XX
        - [Ingrediënt B] ([Hoeveelheid]): €Y.YY
        - ...
        - **Totaal Geschat:** €Z.ZZ

        BELANGRIJK: Geef GEEN extra uitleg, GEEN inleidende zinnen, GEEN afsluitende zinnen. Geef alleen het bijgewerkte recept en de bijgewerkte kostenopbouw in de gevraagde platte tekst opmaak.
        `;
        // ---------------------------

        // --- Call OpenAI API ---
        console.log("Calling OpenAI API for recipe refinement...");
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            // Consider using a potentially more capable model for refinement tasks
            model: 'gpt-3.5-turbo', // Or potentially 'gpt-4o' if available/needed
        });

        const refined_recipe_text = chatCompletion.choices[0]?.message?.content;

        // Check if response exists and has content
        if (!refined_recipe_text || refined_recipe_text.trim().length === 0) {
            console.error('OpenAI response was empty or did not contain recipe text.', chatCompletion);
            throw new Error('Failed to get valid refined recipe text from AI.');
        }
        console.log("Recipe refined by AI.");
        // -----------------------

        // --- Update async_tasks with refined text ---
        console.log(`refineRecipe: Updating task ${recipeId} with refined recipe/breakdown text...`);
        const { error: updateError } = await supabase
            .from('async_tasks')
            .update({
                cost_breakdown: refined_recipe_text, // Store the whole refined text here
                // Optionally, try to parse and update the recipe JSON column too?
                // This is harder as the AI might not return perfect JSON within the text.
                updated_at: new Date().toISOString()
            })
            .eq('task_id', recipeId);

        if (updateError) {
            // Log error but still return result to user
            console.error(`refineRecipe: Failed to update task ${recipeId} with refined text:`, updateError);
        } else {
            console.log(`refineRecipe: Successfully updated task ${recipeId}.`);
        }
        // --- END Update ---

        // --- Extract Cost & Return ---
        const estimated_total_cost = extractEstimatedCost(refined_recipe_text);
        console.log(`Extracted cost from refined recipe: ${estimated_total_cost}`); // Log result

        return {
            statusCode: 200,
            body: JSON.stringify({
                recipe: refined_recipe_text,
                estimated_cost: estimated_total_cost
            }),
        };
        // ---------------------------

    } catch (error) {
        console.error('Error in refineRecipe function handler:', error.message);
        // Check if it's an OpenAI specific error vs other errors
        let statusCode = 500;
        let clientErrorMessage = 'Failed to refine recipe due to an internal server error.';

        // Example: More specific error handling for OpenAI if needed
        // if (error instanceof OpenAI.APIError) { ... }

        // Pass AI communication errors more directly if they occur
        if (error.message.includes('Failed to get valid refined recipe text from AI')) {
            clientErrorMessage = error.message;
            statusCode = 502; // Bad Gateway might be appropriate if AI failed
        }

        const fullErrorDetails = error.response ? JSON.stringify(error.response.data) : error.stack;
        console.error('Full error details:', fullErrorDetails);

        return {
            statusCode: statusCode,
            body: JSON.stringify({ error: clientErrorMessage }),
        };
    }
};
