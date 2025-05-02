const { getServiceClient } = require('./lib/supabaseClient');
const { getOpenAIClient } = require('./lib/openaiClient'); // OpenAI client needed for AI helpers
const {
    parseQuantityAndUnit,
    normalizeUnit,
    getConvertedQuantity,
    getAICostBreakdownEstimate,
    getAIEstimateForSpecificItems,
    extractTotalFromAIBreakdown
} = require('./lib/costUtils');

exports.handler = async function (event, context) {
    // 1. Validate Request
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const taskId = event.queryStringParameters?.taskId;
    if (!taskId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required query parameter: taskId' }) };
    }

    // 2. Initialize Clients using shared modules
    const supabase = getServiceClient();
    const openai = getOpenAIClient(); // Initialize OpenAI client (needed for potential fallbacks)

    // Check if clients initialized properly
    if (!supabase) {
        // Supabase client logs the error internally
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
    }
    // Note: We might proceed even if OpenAI fails, but AI features will be disabled.
    // The costUtils helpers already check if openai client is available.

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

        // 6. Calculate Breakdown - REVISED LOGIC with Unit Conversion
        let totalDbCost = 0;
        const calculatedItems = [];
        const failedItems = [];
        console.log(`getCostBreakdown: Calculating breakdown for task ${taskId} (Hybrid Approach V3 - Unit Conversion)...`);
        for (const recipeIngredient of recipeJson.ingredients) {
            const ingredientName = recipeIngredient.name?.toLowerCase();
            const quantityString = recipeIngredient.quantity || '';
            let failureReason = null;
            const itemInfo = { name: recipeIngredient.name || 'Unknown', quantity_string: quantityString };

            if (!ingredientName) {
                failureReason = 'Missing ingredient name';
                failedItems.push({ ...itemInfo, reason: failureReason }); continue;
            }

            // Parse quantity and unit from recipe
            const { value: quantityValue, unit: quantityUnitRaw } = parseQuantityAndUnit(quantityString);
            if (isNaN(quantityValue) || quantityUnitRaw === null || ['naar smaak', 'snufje', 'beetje'].includes(quantityUnitRaw)) {
                failureReason = `Could not parse quantity/unit '${quantityString}'`;
                failedItems.push({ ...itemInfo, reason: failureReason }); continue;
            }
            const quantityUnit = normalizeUnit(quantityUnitRaw); // Normalize recipe unit

            // Find ingredient in DB
            const dbIngredient = ingredientPriceMap.get(ingredientName);
            if (!dbIngredient) {
                failureReason = `Ingredient not found in DB`;
                failedItems.push({ ...itemInfo, reason: failureReason }); continue;
            }
            const dbUnit = normalizeUnit(dbIngredient.unit); // Normalize DB unit
            const dbPricePerUnit = dbIngredient.price_per_unit;

            let valueToUse = quantityValue;

            // Check if units are different and need conversion
            if (quantityUnit !== dbUnit) {
                valueToUse = getConvertedQuantity(quantityValue, quantityUnit, dbUnit);
                if (isNaN(valueToUse)) {
                    failureReason = `Incompatible units or conversion failed (Recipe: '${quantityUnitRaw}', DB: '${dbIngredient.unit}')`;
                    failedItems.push({ ...itemInfo, reason: failureReason }); continue;
                }
                console.log(`Converted ${quantityValue} ${quantityUnitRaw} to ${valueToUse} ${dbUnit} for ${ingredientName}`);
            }

            // Calculate cost using the (potentially converted) quantity
            const ingredientCost = valueToUse * dbPricePerUnit;
            if (isNaN(ingredientCost)) {
                failureReason = 'Calculated cost is NaN (after potential conversion)';
                failedItems.push({ ...itemInfo, reason: failureReason }); continue;
            }

            // Success for this ingredient
            const calculatedCost = parseFloat(ingredientCost.toFixed(4));
            calculatedItems.push({ ...itemInfo, cost: calculatedCost, unit: dbUnit, quantity_value: valueToUse }); // Note: unit shown is DB unit now
            totalDbCost += calculatedCost;
        }
        console.log(`getCostBreakdown: Finished calculation loop. DB calculated: ${calculatedItems.length}, Failed: ${failedItems.length}`);

        // 7. Determine Response Type, Format Breakdown, Update DB, and Return - REVISED LOGIC
        let finalBreakdownText = "";
        let calculationType = "";
        let finalTotalCost = null;

        if (failedItems.length === 0 && calculatedItems.length > 0) {
            // Scenario 1: All DB Success (no change needed here)
            calculationType = 'db';
            finalTotalCost = parseFloat(totalDbCost.toFixed(2));
            console.log(`getCostBreakdown: DB calculation successful. Total: ${finalTotalCost}`);
            finalBreakdownText = `## Geschatte Kosten Opbouw (Database):
`;
            calculatedItems.forEach(item => {
                finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
            });
            finalBreakdownText += `- **Totaal Geschat:** €${finalTotalCost.toFixed(2)}\n`;

        } else if (calculatedItems.length === 0 && failedItems.length > 0) {
            // Scenario 2: All Failed - Use Full AI Breakdown (no change needed here)
            calculationType = 'ai';
            console.log(`getCostBreakdown: No ingredients calculated from DB. Falling back to full AI estimation.`);
            const aiBreakdown = await getAICostBreakdownEstimate(recipeJson);
            if (aiBreakdown) {
                finalBreakdownText = aiBreakdown;
                finalTotalCost = extractTotalFromAIBreakdown(finalBreakdownText);
            } else {
                finalBreakdownText = "## Geschatte Kosten Opbouw:\n- Kon kosten niet berekenen (AI fallback mislukt).\n- **Totaal Geschat:** N/A\n";
            }

        } else {
            // Scenario 3: Hybrid calculation - REVISED
            calculationType = 'hybrid';
            console.log(`getCostBreakdown: Hybrid calculation. DB total: ${totalDbCost}. Estimating ${failedItems.length} failed items via AI.`);

            // --- Call new helper for FAILED items ONLY ---
            const aiEstimateForFailed = await getAIEstimateForSpecificItems(failedItems);

            if (aiEstimateForFailed !== null) {
                // Successfully got AI estimate for failed items
                finalTotalCost = parseFloat((totalDbCost + aiEstimateForFailed).toFixed(2));
                console.log(`getCostBreakdown: Hybrid - AI estimate for failed items: ${aiEstimateForFailed}, Final Total: ${finalTotalCost}`);

                // Format hybrid breakdown text
                finalBreakdownText = `## Geschatte Kosten Opbouw (Hybride - DB + AI):
`;
                finalBreakdownText += `### Van Database:
`;
                calculatedItems.forEach(item => {
                    finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
                });
                finalBreakdownText += `### Geschat door AI (niet in DB):
`;
                failedItems.forEach(item => {
                    finalBreakdownText += `- ${item.name} (${item.quantity_string}): (Reden: ${item.reason || 'onbekend'})\n`;
                });
                finalBreakdownText += `\n- **Totaal Geschat (Hybride):** €${finalTotalCost.toFixed(2)}\n`;
                finalBreakdownText += `  *(€${totalDbCost.toFixed(2)} van DB + €${aiEstimateForFailed.toFixed(2)} geschat voor rest)*\n`;

            } else {
                // AI estimation for specific items failed
                console.error("Hybrid: AI estimation for specific failed items failed. Showing only DB part.");
                finalTotalCost = parseFloat(totalDbCost.toFixed(2)); // Best guess is the DB part
                finalBreakdownText = `## Geschatte Kosten Opbouw (Deels Database - AI Mislukt):
`;
                finalBreakdownText += `### Van Database:
`;
                calculatedItems.forEach(item => {
                    finalBreakdownText += `- ${item.name} (${item.quantity_string}): €${item.cost.toFixed(2)}\n`;
                });
                finalBreakdownText += `### Niet Berekenbaar via AI:
`;
                failedItems.forEach(item => {
                    finalBreakdownText += `- ${item.name} (${item.quantity_string}): (Reden: ${item.reason || 'onbekend'})\n`;
                });
                finalBreakdownText += `\n- **Totaal (Alleen DB Deel):** €${finalTotalCost.toFixed(2)}\n`;
                finalBreakdownText += `- *AI kon kosten voor ontbrekende items niet schatten.*\n`;
                calculationType = 'hybrid_ai_failed'; // More specific type
            }
        }

        // 8. Update Database
        if (finalBreakdownText) {
            console.log(`getCostBreakdown: Updating task ${taskId} with ${calculationType} breakdown.`);
            const updatePayload = {
                cost_breakdown: finalBreakdownText,
                cost_calculation_type: calculationType,
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
