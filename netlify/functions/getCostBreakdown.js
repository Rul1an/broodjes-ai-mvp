const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Initialize OpenAI client
let openai;
const openaiApiKey = process.env.OPENAI_API_KEY;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log('getCostBreakdown: OpenAI client initialized.');
} else {
    console.warn('getCostBreakdown: Missing OPENAI_API_KEY. AI cost breakdown fallback will not be available.');
}

// --- Helper function for Quantity Parsing (Copied from gcf-calculate-cost) ---
function parseQuantityAndUnit(quantityString) {
    // ... (Implementation of parseQuantityAndUnit - see previous steps or gcf-calculate-cost) ...
    // Make sure the full implementation is pasted here
    if (!quantityString || typeof quantityString !== 'string') {
        return { value: NaN, unit: null };
    }
    quantityString = quantityString.toLowerCase().trim();
    const numberMatch = quantityString.match(/^[\d.,]+/);
    if (!numberMatch) {
        if (['snufje', 'naar smaak', 'beetje'].includes(quantityString)) {
            return { value: NaN, unit: quantityString };
        }
        return { value: NaN, unit: null };
    }
    let value = parseFloat(numberMatch[0].replace(',', '.'));
    if (isNaN(value)) {
        return { value: NaN, unit: null };
    }
    let unit = quantityString.substring(numberMatch[0].length).trim();
    switch (unit) {
        case 'g': case 'gram': unit = 'g'; break;
        case 'kg': case 'kilogram': unit = 'kg'; break;
        case 'l': case 'liter': unit = 'l'; break;
        case 'ml': case 'milliliter': unit = 'ml'; break;
        case 'el': case 'eetlepel': case 'eetlepels': unit = 'el'; break;
        case 'tl': case 'theelepel': case 'theelepels': unit = 'tl'; break;
        case 'st': case 'stk': case 'stuk': case 'stuks': unit = 'stuks'; break;
        case '': if (Number.isInteger(value)) { unit = 'stuks'; } else { unit = null; } break;
    }
    return { value, unit };
}
// --- End Helper Function ---

// --- >>> NEW: Helper function for AI Cost Breakdown Estimation <<< ---
async function getAICostBreakdownEstimate(recipeJson) {
    if (!openai) {
        console.error('Cannot estimate AI breakdown: OpenAI client not initialized.');
        return null;
    }
    if (!recipeJson || !recipeJson.ingredients || !Array.isArray(recipeJson.ingredients)) {
        console.error('Cannot estimate AI breakdown: Invalid recipe JSON format.');
        return null;
    }

    const ingredientsList = recipeJson.ingredients.map(ing => `- ${ing.quantity || ''} ${ing.name || 'Unknown'}`).join('\n');
    const title = recipeJson.title || 'Recept';

    const prompt = `
    Maak een geschatte kostenopbouw in Euro's (€) voor het recept "${title}" met de volgende ingrediënten, gebaseerd op gemiddelde Nederlandse supermarktprijzen. Geef een lijst per ingrediënt en een totaal.

    Formaat voorbeeld:
    ## Geschatte Kosten Opbouw:
    - Ingrediënt 1 (Hoeveelheid): €X.XX
    - Ingrediënt 2 (Hoeveelheid): €Y.YY
    - ...
    - **Totaal Geschat:** €Z.ZZ

    Ingrediënten:
    ${ingredientsList}

    Geef ALLEEN de kostenopbouw in dit formaat terug, zonder extra uitleg.
    `;

    try {
        console.log('Requesting AI cost breakdown estimation...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Je bent een assistent die kostenopbouwen voor recepten schat in Euro's. Reageer alleen met de gevraagde opbouw." },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        console.log('Raw AI cost breakdown response:', aiResponse);

        return aiResponse || null; // Return the raw text or null if empty

    } catch (error) {
        console.error('Error calling OpenAI API for AI cost breakdown:', error);
        return null;
    }
}

exports.handler = async function (event, context) {
    // 1. Validate Request
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const taskId = event.queryStringParameters?.taskId;
    if (!taskId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required query parameter: taskId' }) };
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // Anon key is likely sufficient for reads
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('getCostBreakdown: Supabase URL or Anon Key missing');
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        // 3. Fetch the specific task
        console.log(`getCostBreakdown: Fetching task ${taskId}`);
        const { data: taskData, error: taskError } = await supabase
            .from('async_tasks')
            .select('recipe') // Only need the recipe JSON string
            .eq('task_id', taskId)
            .maybeSingle(); // Expect 0 or 1 result

        if (taskError) {
            console.error(`getCostBreakdown: Error fetching task ${taskId}:`, taskError);
            throw new Error(`Database error fetching task: ${taskError.message}`);
        }
        if (!taskData || !taskData.recipe) {
            return { statusCode: 404, body: JSON.stringify({ error: `Task ${taskId} not found or has no recipe data.` }) };
        }

        // 4. Parse Recipe JSON
        let recipeJson;
        try {
            recipeJson = JSON.parse(taskData.recipe);
            if (!recipeJson.ingredients || !Array.isArray(recipeJson.ingredients)) {
                throw new Error("Recipe JSON missing or has invalid 'ingredients' array.");
            }
        } catch (parseError) {
            console.error(`getCostBreakdown: Failed to parse recipe JSON for task ${taskId}:`, parseError);
            return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse recipe data for cost breakdown.' }) };
        }

        // 5. Fetch all ingredients prices
        console.log('getCostBreakdown: Fetching all ingredient prices...');
        const { data: ingredientsData, error: ingredientsError } = await supabase
            .from('ingredients')
            .select('name, price_per_unit, unit');

        if (ingredientsError) {
            console.error('getCostBreakdown: Error fetching ingredients:', ingredientsError);
            throw new Error(`Database error fetching ingredients: ${ingredientsError.message}`);
        }
        const ingredientPriceMap = new Map(ingredientsData.map(ing => [ing.name.toLowerCase(), ing]));
        console.log(`getCostBreakdown: Fetched ${ingredientPriceMap.size} ingredients.`);

        // 6. Calculate Breakdown
        let totalCalculatedCost = 0;
        const breakdown = [];
        let programmaticCalculationIncomplete = false; // <<< Flag for failure

        console.log(`getCostBreakdown: Calculating breakdown for task ${taskId}...`);
        for (const recipeIngredient of recipeJson.ingredients) {
            const ingredientName = recipeIngredient.name?.toLowerCase();
            const result = {
                name: recipeIngredient.name || 'Unknown',
                quantity_string: recipeIngredient.quantity || '',
                status: 'ok', // Default status
                cost: null,
                parsed_quantity: null,
                parsed_unit: null,
                db_price_per_unit: null,
                db_unit: null,
                message: ''
            };

            if (!ingredientName) {
                result.status = 'parse_error';
                result.message = 'Missing ingredient name in recipe.';
                breakdown.push(result);
                programmaticCalculationIncomplete = true; // <<< Mark failure
                continue;
            }

            // Parse quantity and unit from recipe string
            const { value: quantityValue, unit: quantityUnit } = parseQuantityAndUnit(recipeIngredient.quantity);
            result.parsed_quantity = quantityValue;
            result.parsed_unit = quantityUnit;

            if (isNaN(quantityValue) || quantityUnit === null || quantityUnit === 'naar smaak' || quantityUnit === 'snufje') {
                result.status = 'parse_error';
                result.message = `Could not parse quantity/unit '${recipeIngredient.quantity}'.`;
                breakdown.push(result);
                programmaticCalculationIncomplete = true; // <<< Mark failure
                continue;
            }

            // Find ingredient in DB
            const dbIngredient = ingredientPriceMap.get(ingredientName);
            if (!dbIngredient) {
                result.status = 'not_found';
                result.message = `Ingredient not found in database.`;
                breakdown.push(result);
                programmaticCalculationIncomplete = true; // <<< Mark failure
                continue;
            }
            result.db_price_per_unit = dbIngredient.price_per_unit;
            result.db_unit = dbIngredient.unit;

            // Compare units (simple match for now)
            const dbUnitNormalized = dbIngredient.unit?.toLowerCase();
            if (dbUnitNormalized !== quantityUnit) {
                result.status = 'unit_mismatch';
                result.message = `Unit mismatch. Recipe: '${quantityUnit}', DB: '${dbUnitNormalized}'.`;
                // TODO: Add unit conversion logic here if desired
                breakdown.push(result);
                programmaticCalculationIncomplete = true; // <<< Mark failure
                continue;
            }

            // Calculate cost for this ingredient
            const ingredientCost = quantityValue * dbIngredient.price_per_unit;
            if (isNaN(ingredientCost)) {
                result.status = 'error';
                result.message = 'Calculated cost resulted in NaN.';
                breakdown.push(result);
                programmaticCalculationIncomplete = true; // <<< Mark failure
                continue;
            }

            result.cost = parseFloat(ingredientCost.toFixed(4)); // Store cost with precision
            totalCalculatedCost += ingredientCost;
            breakdown.push(result); // Add successful result
        }

        console.log(`getCostBreakdown: Finished calculation loop for task ${taskId}. Incomplete: ${programmaticCalculationIncomplete}`);

        // 7. Determine Response Type and Return
        if (!programmaticCalculationIncomplete && breakdown.length > 0) {
            // Programmatic success
            console.log(`getCostBreakdown: Programmatic calculation successful. Total: ${totalCalculatedCost}`);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    calculationType: 'database',
                    taskId: taskId,
                    breakdown: breakdown,
                    totalCalculatedCost: parseFloat(totalCalculatedCost.toFixed(2))
                }),
            };
        } else {
            // Programmatic failed or incomplete, try AI fallback
            console.log(`getCostBreakdown: Programmatic calculation failed or incomplete. Attempting AI fallback.`);
            if (!openai) {
                console.warn('getCostBreakdown: Cannot fall back to AI, OpenAI client not initialized.');
                // Return the partial/failed programmatic breakdown instead?
                return {
                    statusCode: 200, // Still success, but indicate partial data
                    body: JSON.stringify({
                        calculationType: 'database_failed', // Indicate failure
                        taskId: taskId,
                        breakdown: breakdown, // Send partial/failed results
                        totalCalculatedCost: null
                    }),
                };
            }

            try {
                const aiBreakdownText = await getAICostBreakdownEstimate(recipeJson);
                if (aiBreakdownText) {
                    console.log(`getCostBreakdown: AI fallback successful.`);
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            calculationType: 'ai',
                            taskId: taskId,
                            aiBreakdownText: aiBreakdownText
                        }),
                    };
                } else {
                    console.error(`getCostBreakdown: AI fallback failed to generate text.`);
                    throw new Error('AI fallback failed to generate breakdown.');
                }
            } catch (aiError) {
                console.error(`getCostBreakdown: Error during AI fallback:`, aiError);
                // Return the partial/failed programmatic breakdown if AI fails too
                return {
                    statusCode: 200, // Or 500 if AI error is critical?
                    body: JSON.stringify({
                        calculationType: 'ai_failed', // Indicate AI failure too
                        taskId: taskId,
                        breakdown: breakdown,
                        totalCalculatedCost: null,
                        error: aiError.message
                    }),
                };
            }
        }

    } catch (error) {
        console.error(`getCostBreakdown: Error processing taskId ${taskId}:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Failed to calculate cost breakdown: ${error.message}` }),
        };
    }
};
