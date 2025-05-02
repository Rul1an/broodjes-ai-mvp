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

// --- >>> NEW: Unit Conversion Helpers <<< ---

// Normalize common unit aliases
function normalizeUnit(unit) {
    if (!unit) return null;
    unit = unit.toLowerCase().trim();
    switch (unit) {
        case 'gram': case 'gr': return 'g';
        case 'kilogram': return 'kg';
        case 'milliliter': return 'ml';
        case 'liter': return 'l';
        case 'eetlepel': case 'eetlepels': return 'el'; // Approx volume
        case 'theelepel': case 'theelepels': return 'tl'; // Approx volume
        case 'stuk': case 'stk': case 'plakje': case 'plakjes': return 'stuks'; // Normalize count units
        default: return unit; // Return original if no specific normalization
    }
}

// Attempt to convert quantity between compatible units
function getConvertedQuantity(value, fromUnitRaw, toUnitRaw) {
    const fromUnit = normalizeUnit(fromUnitRaw);
    const toUnit = normalizeUnit(toUnitRaw);

    if (!fromUnit || !toUnit || fromUnit === toUnit) {
        return value; // No conversion needed or possible
    }

    // Weight Conversions
    if (fromUnit === 'g' && toUnit === 'kg') return value / 1000;
    if (fromUnit === 'kg' && toUnit === 'g') return value * 1000;

    // Volume Conversions
    if (fromUnit === 'ml' && toUnit === 'l') return value / 1000;
    if (fromUnit === 'l' && toUnit === 'ml') return value * 1000;

    // TODO: Add approximate volume conversions if needed (el/tl to ml/l)
    // e.g., if (fromUnit === 'el' && toUnit === 'ml') return value * 15; // Approx 15ml/el

    // If units are different but not handled by conversion rules, return NaN
    console.warn(`Unit conversion not implemented between '${fromUnitRaw}' and '${toUnitRaw}'`);
    return NaN;
}

// --- >>> END Unit Conversion Helpers <<< ---

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
    // Added optional asterisks `(?:\*\*)?` around the text part and the multiline 'm' flag.
    const regex = /(?:(?:\*\*)?(?:totaal|total)\s+(?:geschat|estimated)(?:\*\*)?)[:]?\s*(?:€|eur|euro)?\s*(\d+[.,]?\d*)/im;
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

// --- >>> NEW: Helper function for AI Cost Estimation of SPECIFIC Failed Items <<< ---
async function getAIEstimateForSpecificItems(failedItemsList) {
    if (!openai) {
        console.error('Cannot estimate specific items: OpenAI client not initialized.');
        return null;
    }
    if (!failedItemsList || !Array.isArray(failedItemsList) || failedItemsList.length === 0) {
        console.warn('Cannot estimate specific items: Invalid or empty list provided.');
        return 0; // Return 0 cost if list is empty
    }

    const ingredientsToEstimate = failedItemsList.map(item => `- ${item.quantity_string || ''} ${item.name || 'Unknown'} (${item.reason || 'reason unknown'})`).join('\n');

    const prompt = `
    Schat de gecombineerde kosten in Euro's (€) ALLEEN voor de volgende lijst met ingrediënten (hoeveelheden en redenen voor falen zijn ter info), gebaseerd op gemiddelde Nederlandse supermarktprijzen.

    Geef ALLEEN het totale geschatte numerieke bedrag terug (bijv. "3.45"). Geef GEEN valutasymbool, GEEN extra uitleg, GEEN lijst per item.

    Te schatten ingrediënten:
    ${ingredientsToEstimate}
    `;

    try {
        console.log(`Requesting AI cost estimation for ${failedItemsList.length} specific items...`);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Still efficient for this task
            messages: [
                { role: "system", content: "Je bent een assistent die de gecombineerde kosten van een lijst ingrediënten schat in Euro's. Reageer ALLEEN met het totale numerieke bedrag (bv. 4.75)." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2, // Lower temperature for more deterministic numerical output
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        console.log('Raw AI specific item cost response:', aiResponse);

        if (aiResponse) {
            const cost = parseFloat(aiResponse.replace(',', '.'));
            if (!isNaN(cost)) {
                console.log(`Parsed AI specific item cost: ${cost}`);
                return cost;
            }
        }
        console.error('Failed to parse numerical cost from AI response for specific items:', aiResponse);
        return null; // Indicate failure to parse

    } catch (error) {
        console.error('Error calling OpenAI API for specific item cost estimation:', error);
        return null; // Indicate API error
    }
}
// --- >>> END NEW Specific Item Helper <<< ---

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
