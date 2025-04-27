// Serverless function to generate recipes, estimate cost, and save to Supabase
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js'); // Import Supabase client

// Initialize OpenAI client with API key from environment variable
// The API key will be securely stored in Netlify's environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- Cost Calculation/Extraction Logic ---

// Function to extract cost estimate from AI text (fallback for overall cost)
function extractAICostEstimate(text) {
    if (!text) return null;
    console.log("Attempting AI cost extraction...");
    // Updated regex to optionally handle markdown asterisks around the key phrase
    // It looks for "Geschatte totale kosten" (potentially bold) followed by a number.
    const regex = /(?:\*\*?)?Geschatte\s+totale\s+kosten(?:\*\*?)?\s*[:]?\s*(?:€|euro|eur)?\s*(\d+[.,]?\d*)/i;
    const match = text.match(regex);
    if (match && match[1]) {
        // Group 1 now captures the number
        const costString = match[1].replace(',', '.');
        const cost = parseFloat(costString);
        if (!isNaN(cost)) {
            console.log(`AI Extract: Found cost: ${cost}`);
            return cost;
        }
    }
    console.log("AI Extract: No cost pattern found.");
    return null; // Return null if no cost found
}

// NEW: Function to extract ingredients JSON from AI response text
function extractIngredientsJSON(text) {
    if (!text) return null;
    // Look for a JSON block starting with ```json and ending with ```
    const regex = /```json\\s*(\\[.*?\\])\\s*```/s; // s flag for dot matching newlines
    const match = text.match(regex);
    if (match && match[1]) {
        try {
            const jsonData = JSON.parse(match[1]);
            // Basic validation of the expected structure
            if (Array.isArray(jsonData) && jsonData.every(item =>
                item && typeof item.name === 'string' &&
                item.quantity !== undefined && typeof item.unit === 'string')) {
                console.log("Successfully extracted and validated ingredients JSON.");
                return jsonData;
            }
            console.warn("Extracted JSON does not match expected format:", jsonData);
        } catch (e) {
            console.error("Error parsing extracted JSON:", e);
        }
    } else {
        console.warn("Could not find ingredients JSON block in AI response.");
    }
    return null;
}

// NEW: Function to calculate cost from JSON ingredients using DB prices
// Modified to return calculation details for debugging
async function calculateCostFromJSON(ingredientsJson, supabase) {
    const debugDetails = {
        attempted: true,
        dbFetchSuccess: false,
        ingredientsFoundInDB: 0,
        itemsUsedInCalc: 0,
        calculatedValue: null,
        skippedItems: []
    };

    if (!ingredientsJson || ingredientsJson.length === 0) {
        debugDetails.attempted = false;
        return { cost: null, debug: debugDetails };
    }

    const ingredientNames = ingredientsJson.map(item => item.name);
    if (ingredientNames.length === 0) {
        debugDetails.attempted = false;
        return { cost: null, debug: debugDetails };
    }

    let dbIngredients = [];
    try {
        console.log(`Fetching DB prices for ${ingredientNames.length} ingredients from JSON...`);
        const { data, error } = await supabase
            .from('ingredients')
            .select('name, unit, price_per_unit')
            .in('name', ingredientNames);

        if (error) {
            console.error("Supabase error fetching ingredient prices:", error);
            debugDetails.skippedItems.push({ reason: "DB_FETCH_ERROR", details: error.message });
            return { cost: null, debug: debugDetails };
        }
        dbIngredients = data || [];
        debugDetails.dbFetchSuccess = true;
        debugDetails.ingredientsFoundInDB = dbIngredients.length;
        console.log(`Found ${dbIngredients.length} matching ingredients in DB.`);
    } catch (fetchError) {
        console.error("Exception fetching ingredient prices:", fetchError);
        debugDetails.skippedItems.push({ reason: "DB_FETCH_EXCEPTION", details: fetchError.message });
        return { cost: null, debug: debugDetails };
    }

    let calculatedCost = 0;
    const dbPriceMap = new Map(dbIngredients.map(item => [item.name.toLowerCase(), item]));

    ingredientsJson.forEach(item => {
        const dbItem = dbPriceMap.get(item.name.toLowerCase());
        let skipped = false;
        let reason = "";

        if (!dbItem || dbItem.price_per_unit === null) {
            reason = "NOT_FOUND_IN_DB_OR_NO_PRICE";
            skipped = true;
        } else if (!item.unit || !dbItem.unit || item.unit.toLowerCase() !== dbItem.unit.toLowerCase()) {
            reason = `UNIT_MISMATCH (Recipe: '${item.unit}', DB: '${dbItem.unit}')`;
            skipped = true;
        } else {
            const quantity = Number(item.quantity);
            if (isNaN(quantity) || quantity <= 0) { // Also check for 0 or less
                reason = `INVALID_QUANTITY (${item.quantity})`;
                skipped = true;
            } else {
                const itemCost = quantity * dbItem.price_per_unit;
                calculatedCost += itemCost;
                debugDetails.itemsUsedInCalc++;
                console.log(`DB Cost Calc: Using ${item.name} - Qty: ${quantity}, Unit: ${item.unit}, DB Price/Unit: ${dbItem.price_per_unit}, Item Cost: ${itemCost.toFixed(4)}`);
            }
        }

        if (skipped) {
            console.warn(`DB Cost Calc: Skipping ${item.name} due to ${reason}`);
            debugDetails.skippedItems.push({ name: item.name, reason: reason });
        }
    });

    debugDetails.calculatedValue = calculatedCost;
    console.log(`DB Cost Calc (JSON): Total calculated cost: ${calculatedCost.toFixed(4)} from ${debugDetails.itemsUsedInCalc} items.`);

    const finalCost = debugDetails.itemsUsedInCalc > 0 ? calculatedCost : null;
    return { cost: finalCost, debug: debugDetails };
}

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

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing in generate function');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }
        supabase = createClient(supabaseUrl, supabaseAnonKey);

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
