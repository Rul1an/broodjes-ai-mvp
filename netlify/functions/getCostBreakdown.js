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

// --- >>> NEW: Helper function to extract Total Cost from AI Breakdown Text <<< ---
function extractTotalFromAIBreakdown(breakdownText) {
    if (!breakdownText) return null;
    // Regex to find "Totaal Geschat: €Z.ZZ" or similar variations
    // Making it case-insensitive and allowing for different currency symbols/placements
    const regex = /(?:totaal|total)\s+(?:geschat|estimated)[:]?\s*(?:€|eur|euro)?\s*(\\d+[.,]?\\d*)/i;
    const match = breakdownText.match(regex);
    if (match && match[1]) {
        try {
            const costString = match[1].replace(',', '.');
            const cost = parseFloat(costString);
            if (!isNaN(cost)) {
                console.log(`Extracted AI Total: ${cost}`);
                return cost;
            }
        } catch (e) {
            console.error("Error parsing extracted AI total cost:", e);
        }
    }
    console.warn("Could not extract total cost from AI breakdown text:", breakdownText);
    return null;
}
// --- >>> END NEW Helper <<< ---

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
    // const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // Need Service Role for updates
    const supabaseServiceKey = process.env.SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('getCostBreakdown: Supabase URL or Service Key missing');
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey); // <<< Use Service Key

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

        // 6. Calculate Breakdown - REVISED LOGIC
        let totalDbCost = 0;
        const calculatedItems = []; // Store items successfully calculated from DB
        const failedItems = []; // Store items that failed DB calculation

        console.log(`getCostBreakdown: Calculating breakdown for task ${taskId} (Hybrid Approach)...`);
        for (const recipeIngredient of recipeJson.ingredients) {
            const ingredientName = recipeIngredient.name?.toLowerCase();
            const quantityString = recipeIngredient.quantity || '';
            let failureReason = null; // Track reason for failure

            // Basic info for tracking
            const itemInfo = {
                name: recipeIngredient.name || 'Unknown',
                quantity_string: quantityString,
            };

            if (!ingredientName) {
                result.status = 'parse_error';
                result.message = 'Missing ingredient name in recipe.';
                breakdown.push(result);
                programmaticCalculationIncomplete = true; // <<< Mark failure
                continue;
            }

            // Parse quantity and unit
            const { value: quantityValue, unit: quantityUnit } = parseQuantityAndUnit(quantityString);
            if (isNaN(quantityValue) || quantityUnit === null || ['naar smaak', 'snufje', 'beetje'].includes(quantityUnit)) {
                failureReason = `Could not parse quantity/unit '${quantityString}'.`;
                failedItems.push({ ...itemInfo, reason: failureReason });
                continue;
            }

            // Find ingredient in DB
            const dbIngredient = ingredientPriceMap.get(ingredientName);
            if (!dbIngredient) {
                failureReason = `Ingredient not found in database.`;
                failedItems.push({ ...itemInfo, reason: failureReason });
                continue;
            }

            // Compare units (simple match)
            const dbUnitNormalized = dbIngredient.unit?.toLowerCase();
            if (dbUnitNormalized !== quantityUnit) {
                // TODO: Add unit conversion logic here if desired
                failureReason = `Unit mismatch. Recipe: '${quantityUnit}', DB: '${dbUnitNormalized}'.`;
                failedItems.push({ ...itemInfo, reason: failureReason, dbUnit: dbUnitNormalized, dbPrice: dbIngredient.price_per_unit }); // Include DB info for potential future use
                continue;
            }

            // Calculate cost
            const ingredientCost = quantityValue * dbIngredient.price_per_unit;
            if (isNaN(ingredientCost)) {
                failureReason = 'Calculated cost resulted in NaN.';
                failedItems.push({ ...itemInfo, reason: failureReason, dbUnit: dbUnitNormalized, dbPrice: dbIngredient.price_per_unit });
                continue;
            }

            // If all checks passed, add to calculatedItems
            const calculatedCost = parseFloat(ingredientCost.toFixed(4)); // Use 4 decimal places for calculation
            calculatedItems.push({
                ...itemInfo,
                cost: calculatedCost,
                unit: quantityUnit, // Store the matched unit
                quantity_value: quantityValue
            });
            totalDbCost += calculatedCost;
        } // End of loop through ingredients

        console.log(`getCostBreakdown: Finished calculation loop. DB calculated: ${calculatedItems.length}, Failed: ${failedItems.length}`);

        // 7. Determine Response Type, Format Breakdown, Update DB, and Return - REVISED LOGIC
        let finalBreakdownText = "";
        let calculationType = "";
        let finalTotalCost = null; // Can be number or null

        if (failedItems.length === 0 && calculatedItems.length > 0) {
            // Scenario 1: All ingredients calculated successfully from DB
            calculationType = 'db';
            finalTotalCost = parseFloat(totalDbCost.toFixed(2)); // Final total rounded to 2 decimals
            console.log(`getCostBreakdown: DB calculation successful. Total: ${finalTotalCost}`);

            finalBreakdownText = `## Geschatte Kosten Opbouw (Database):\n`;
            calculatedItems.forEach(item => {
                finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
            });
            finalBreakdownText += `- **Totaal Geschat:** €${finalTotalCost.toFixed(2)}\n`;

        } else if (calculatedItems.length === 0 && failedItems.length > 0) {
            // Scenario 2: No ingredients could be calculated from DB, fallback entirely to AI
            calculationType = 'ai';
            console.log(`getCostBreakdown: No ingredients calculated from DB. Falling back to full AI estimation.`);
            const aiBreakdown = await getAICostBreakdownEstimate(recipeJson);
            if (aiBreakdown) {
                finalBreakdownText = aiBreakdown; // Use AI response directly
                finalTotalCost = extractTotalFromAIBreakdown(finalBreakdownText); // Extract total if possible
            } else {
                finalBreakdownText = "## Geschatte Kosten Opbouw:\n- Kon kosten niet berekenen (AI fallback mislukt).\n- **Totaal Geschat:** N/A\n";
                // Keep finalTotalCost as null
            }

        } else {
            // Scenario 3: Hybrid calculation
            calculationType = 'hybrid';
            console.log(`getCostBreakdown: Hybrid calculation needed. DB total: ${totalDbCost}`);
            const aiFullBreakdown = await getAICostBreakdownEstimate(recipeJson); // Get AI estimate for the whole recipe

            if (aiFullBreakdown) {
                const aiTotalEstimate = extractTotalFromAIBreakdown(aiFullBreakdown);

                if (aiTotalEstimate !== null) {
                    // Estimate cost of failed items based on difference
                    let estimatedFailedItemsCost = aiTotalEstimate - totalDbCost;
                    if (estimatedFailedItemsCost < 0) {
                        console.warn(`AI total (${aiTotalEstimate}) was less than DB calculated cost (${totalDbCost}). Setting failed items cost to 0.`);
                        estimatedFailedItemsCost = 0; // Prevent negative costs
                    }
                    finalTotalCost = parseFloat((totalDbCost + estimatedFailedItemsCost).toFixed(2)); // Calculate final hybrid total
                    console.log(`getCostBreakdown: Hybrid - AI Total: ${aiTotalEstimate}, Failed Items Est: ${estimatedFailedItemsCost}, Final Total: ${finalTotalCost}`);

                    // Format hybrid breakdown
                    finalBreakdownText = `## Geschatte Kosten Opbouw (Hybride):\n`;
                    finalBreakdownText += `### Van Database:\n`;
                    calculatedItems.forEach(item => {
                        finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
                    });
                    finalBreakdownText += `### Geschat (AI):\n`;
                    failedItems.forEach(item => {
                        finalBreakdownText += `- ${item.name} (${item.quantity_string}): (Niet in DB - ${item.reason || 'onbekend'})\n`;
                    });
                    finalBreakdownText += `\n- **Totaal Geschat (Hybride):** €${finalTotalCost.toFixed(2)}\n`;
                    finalBreakdownText += `  *(Gebaseerd op €${totalDbCost.toFixed(2)} van DB + €${estimatedFailedItemsCost.toFixed(2)} geschat voor rest)*\n`;


                } else {
                    // AI ran but couldn't extract total, fallback to showing only DB items + warning
                    console.warn("Hybrid: AI ran but couldn't extract total. Showing only DB part.");
                    finalTotalCost = parseFloat(totalDbCost.toFixed(2)); // Best guess is the DB part
                    finalBreakdownText = `## Geschatte Kosten Opbouw (Deels Database):\n`;
                    calculatedItems.forEach(item => {
                        finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
                    });
                    finalBreakdownText += `### Niet Berekenbaar via DB:\n`;
                    failedItems.forEach(item => {
                        finalBreakdownText += `- ${item.name} (${item.quantity_string}): (${item.reason || 'onbekend'})\n`;
                    });
                    finalBreakdownText += `\n- **Totaal (Deels Geschat):** €${finalTotalCost.toFixed(2)} (Alleen DB deel)\n`;
                    finalBreakdownText += `- *Kon geen volledige AI schatting maken.*\n`;
                    calculationType = 'db_partial'; // Use a specific type
                }

            } else {
                // AI fallback failed entirely, only show DB part + warning
                console.error("Hybrid: AI fallback failed entirely. Showing only DB part.");
                finalTotalCost = parseFloat(totalDbCost.toFixed(2));
                finalBreakdownText = `## Geschatte Kosten Opbouw (Deels Database):\n`;
                calculatedItems.forEach(item => {
                    finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
                });
                finalBreakdownText += `### Niet Berekenbaar via DB:\n`;
                failedItems.forEach(item => {
                    finalBreakdownText += `- ${item.name} (${item.quantity_string}): (${item.reason || 'onbekend'})\n`;
                });
                finalBreakdownText += `\n- **Totaal (Deels Geschat):** €${finalTotalCost.toFixed(2)} (Alleen DB deel)\n`;
                finalBreakdownText += `- *AI fallback mislukt.*\n`;
                calculationType = 'db_partial_ai_failed';
            }
        }

        // 8. Update Database
        if (finalBreakdownText) {
            console.log(`getCostBreakdown: Updating task ${taskId} with ${calculationType} breakdown.`);
            const updatePayload = {
                cost_breakdown: finalBreakdownText,
                // Optionally update estimated_cost if you want a numeric total stored separately
                // estimated_cost: finalTotalCost,
                cost_calculation_type: calculationType, // Add a column for this?
                updated_at: new Date().toISOString()
            };
            const { error: updateError } = await supabase
                .from('async_tasks')
                .update(updatePayload)
                .eq('task_id', taskId);

            if (updateError) {
                // Log error but don't fail the request, user still gets the breakdown
                console.error(`getCostBreakdown: Failed to update task ${taskId} with breakdown:`, updateError);
            } else {
                console.log(`getCostBreakdown: Successfully updated task ${taskId}.`);
            }
        } else {
            console.warn(`getCostBreakdown: No final breakdown text generated for task ${taskId}. DB not updated.`);
        }


        // 9. Return Response
        return {
            statusCode: 200,
            body: JSON.stringify({
                breakdown: finalBreakdownText,
                calculationType: calculationType
            }),
        };

    } catch (error) {
        console.error('Error in getCostBreakdown handler:', error.message);
        const fullErrorDetails = error.response ? JSON.stringify(error.response.data) : error.stack;
        console.error('Full error details:', fullErrorDetails);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error during cost breakdown calculation.' }),
        };
    }
};
