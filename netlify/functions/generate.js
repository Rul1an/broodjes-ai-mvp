// Serverless function to generate recipes, estimate cost, and save to Supabase
const { OpenAI } = require('openai');
// const { createClient } = require('@supabase/supabase-js'); // No longer needed directly
const { getServiceClient } = require('./lib/supabaseClient'); // Use shared client
const {
    extractAICostEstimate,      // Import from costUtils
    extractIngredientsJSON,     // Import from costUtils
    calculateCostFromJSON       // Import from costUtils
} = require('./lib/costUtils');

// Initialize OpenAI client with API key from environment variable
// The API key will be securely stored in Netlify's environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- Cost Calculation/Extraction Logic --- MOVED TO costUtils.js ---

// Function to extract cost estimate from AI text (fallback for overall cost)
// MOVED to costUtils.js as extractAICostEstimate

// NEW: Function to extract ingredients JSON from AI response text
// MOVED to costUtils.js as extractIngredientsJSON

// NEW: Function to calculate cost from JSON ingredients using DB prices
// MOVED to costUtils.js as calculateCostFromJSON

// -------------------------------------

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    let supabase; // Define supabase client variable outside try block
    let body; // Define body variable
    let debugInfo = { // Initialize debug object
        cost_calculation_method: "unknown",
        json_extracted: false,
        db_calculation_details: null,
        ai_fallback_cost_extracted: null
    };

    try {
        // --- Input Parsing and Validation ---
        try {
            // Check if body exists before parsing
            if (!event.body) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
            }
            body = JSON.parse(event.body);
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON format in request body.' }) };
        }

        const idea = body.idea;
        const requestedModel = body.model || 'gpt-3.5-turbo'; // Default model

        // Validate 'idea' input
        if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Parameter "idea" must be a non-empty string.' }),
            };
        }
        // Use trimmed idea for consistency
        const trimmedIdea = idea.trim();

        // Validate 'model' input
        const allowedModels = ['gpt-3.5-turbo', 'gpt-4o'];
        const modelToUse = allowedModels.includes(requestedModel) ? requestedModel : 'gpt-3.5-turbo';
        if (modelToUse !== requestedModel) {
            console.warn(`Received unsupported model '${requestedModel}', defaulting to ${modelToUse}.`);
            // Optional: return 400 if strict model adherence is required
            // return { statusCode: 400, body: JSON.stringify({ error: `Unsupported model: ${requestedModel}` }) };
        }
        // ----------------------------------

        // Initialize Supabase client using shared helper (Service Role Key)
        supabase = getServiceClient();
        if (!supabase) {
            console.error('generate: Supabase client failed to initialize.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
        }

        // --- 2. Generate Recipe with OpenAI (ask for cost estimate AND JSON) ---
        const prompt = `
        Genereer een gedetailleerd recept voor een broodje gebaseerd op het volgende idee: '${trimmedIdea}'.

        VEREISTEN:
        1.  **Ingrediënten:** Lijst met benodigde ingrediënten en *realistische* geschatte hoeveelheden (als getal, bv. 100, 2, 0.5) en eenheden (bv. g, plakjes, el, stuk, ml) voor één broodje.
        2.  **Bereidingsstappen:** Duidelijke, stapsgewijze instructies.
        3.  **Geschatte Tijd:** Geef een globale schatting van de totale bereidingstijd.
        4.  **Geschatte Kosten:** Geef een *schatting* van de totale kostprijs (bv. "Geschatte totale kosten: €X.XX"). Baseer dit op algemene supermarktprijzen (Euro).
        5.  **Ingrediënten JSON:** Geef OOK een JSON array met de ingrediënten onderaan de response, in het volgende formaat binnen een code block:
            \`\`\`json
            [\n              { "name": "IngrediëntNaam", "quantity": <getal>, "unit": "eenheid" },\n              { "name": "AnderIngrediënt", "quantity": <getal>, "unit": "eenheid" }\n            ]
            \`\`\`
            Zorg ervoor dat de JSON valide is. Gebruik numerieke waarden voor quantity.

        OPMAAK:
        Gebruik duidelijke kopjes voor de tekstuele delen (Ingrediënten, Bereiding, Geschatte Tijd, Geschatte Kosten).
        Plaats de JSON ingrediëntenlijst helemaal aan het EINDE van je response, na alle andere tekst.
        `;

        console.log(`Calling OpenAI API with model: ${modelToUse}`);
        const chatCompletion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: modelToUse,
            // Consider adjusting temperature if JSON format is inconsistent
            // temperature: 0.5,
        });
        const generated_recipe_text = chatCompletion.choices[0]?.message?.content;

        if (!generated_recipe_text || generated_recipe_text.trim().length === 0) {
            console.error('OpenAI response was empty or did not contain recipe text.', chatCompletion);
            throw new Error('Failed to get valid recipe text from AI.');
        }
        console.log("Recipe text generated by AI.");
        // -------------------------------------

        // --- 3. Determine Final Cost (JSON DB calc or AI extract fallback) ---
        let final_estimated_cost = null;
        console.log("Determining final cost...");

        // Attempt 1: Extract JSON and calculate cost based on DB
        const ingredientsJson = extractIngredientsJSON(generated_recipe_text);
        debugInfo.json_extracted = !!ingredientsJson; // Record if JSON was found

        if (ingredientsJson) {
            const { cost, debug: calcDebug } = await calculateCostFromJSON(ingredientsJson, supabase);
            final_estimated_cost = cost;
            debugInfo.db_calculation_details = calcDebug; // Store details
            if (final_estimated_cost !== null) {
                debugInfo.cost_calculation_method = "json_db_match";
            } else {
                debugInfo.cost_calculation_method = "json_db_no_match"; // JSON found, but no items matched/calculated
            }
        } else {
            debugInfo.cost_calculation_method = "json_extraction_failed";
        }

        // Attempt 2: Fallback to extracting overall cost estimate from AI text
        if (final_estimated_cost === null) {
            console.log("DB cost calculation from JSON failed or yielded null, falling back to AI text extraction.");
            final_estimated_cost = extractAICostEstimate(generated_recipe_text);
            debugInfo.ai_fallback_cost_extracted = final_estimated_cost;
            if (final_estimated_cost !== null) {
                // Overwrite method if fallback succeeded
                debugInfo.cost_calculation_method = "ai_text_fallback";
            } else {
                // Keep previous method status (e.g., json_extraction_failed)
                console.log("AI text extraction fallback also failed.");
            }
        } else {
            console.log(`Using cost calculated from DB ingredients via JSON: €${final_estimated_cost.toFixed(2)}`);
        }
        console.log(`Final determined cost to be saved: ${final_estimated_cost}`);
        // ------------------------------------------------------

        // --- 4. Save Recipe and Final Cost to Supabase ---
        console.log("Saving recipe to Supabase...");
        const { data: savedRecipe, error: saveError } = await supabase
            .from('recipes')
            .insert([{
                idea: trimmedIdea,
                generated_recipe: generated_recipe_text,
                estimated_total_cost: final_estimated_cost
            }])
            .select()
            .single();

        if (saveError) {
            console.error('Error saving recipe to Supabase:', saveError);
        } else {
            if (savedRecipe) {
                console.log(`Recipe saved successfully to Supabase with ID: ${savedRecipe.id}`);
            } else {
                console.warn("Recipe insert operation completed, but no data returned from Supabase.");
            }
        }
        // --------------------------------------------------

        // --- 5. Return Response with Debug Info ---
        return {
            statusCode: 200,
            body: JSON.stringify({
                recipe: generated_recipe_text,
                estimated_cost: final_estimated_cost,
                // Add debug info here
                _debug_info: debugInfo
            }),
        };
        // ---------------------------

    } catch (error) {
        console.error('Error in generate function handler:', error.message);
        let statusCode = 500;
        let clientErrorMessage = 'Failed to generate recipe due to an internal server error.';

        if (error.message.includes('Failed to get valid recipe text from AI')) {
            clientErrorMessage = error.message;
            statusCode = 502; // Bad Gateway
        }

        const fullErrorDetails = error.response ? JSON.stringify(error.response.data) : error.stack;
        console.error('Full error details:', fullErrorDetails);

        // Return error and potentially partial debug info
        return {
            statusCode: statusCode,
            body: JSON.stringify({ error: clientErrorMessage, _debug_info: debugInfo }),
        };
    }
};
