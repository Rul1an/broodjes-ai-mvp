// --- Quantity Parsing ---
function parseQuantityAndUnit(quantityString) {
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
        // Keep original unit if not matched
    }
    return { value, unit };
}

// --- Unit Conversion ---
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

// --- AI Helpers (dependent on OpenAI client) ---
const { getOpenAIClient } = require('./openaiClient');

async function getAICostBreakdownEstimate(recipeJson) {
    const openai = getOpenAIClient();
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

        return aiResponse || null;

    } catch (error) {
        console.error('Error calling OpenAI API for AI cost breakdown:', error);
        return null;
    }
}

async function getAIEstimateForSpecificItems(failedItemsList) {
    const openai = getOpenAIClient();
    if (!openai) {
        console.error('Cannot estimate specific items: OpenAI client not initialized.');
        return null;
    }
    if (!failedItemsList || !Array.isArray(failedItemsList) || failedItemsList.length === 0) {
        console.warn('Cannot estimate specific items: Invalid or empty list provided.');
        return 0;
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
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Je bent een assistent die de gecombineerde kosten van een lijst ingrediënten schat in Euro's. Reageer ALLEEN met het totale numerieke bedrag (bv. 4.75)." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2,
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
        return null;

    } catch (error) {
        console.error('Error calling OpenAI API for specific item cost estimation:', error);
        return null;
    }
}

// --- Cost Extraction ---
function extractTotalFromAIBreakdown(breakdownText) {
    if (!breakdownText) return null;
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

// --- Cost Extraction/Calculation Helpers from generate.js ---

// Function to extract cost estimate from AI text (fallback for overall cost)
// Looks for "Geschatte totale kosten: €X.XX"
function extractAICostEstimate(text) {
    if (!text) return null;
    console.log("Attempting AI cost extraction (generate.js pattern)...");
    const regex = /(?:\*\*?)?Geschatte\s+totale\s+kosten(?:\*\*?)?\s*[:]?\s*(?:€|euro|eur)?\s*(\d+[.,]?\d*)/i;
    const match = text.match(regex);
    if (match && match[1]) {
        const costString = match[1].replace(',', '.');
        const cost = parseFloat(costString);
        if (!isNaN(cost)) {
            console.log(`AI Extract (generate.js): Found cost: ${cost}`);
            return cost;
        }
    }
    console.log("AI Extract (generate.js): No cost pattern found.");
    return null;
}

// Function to extract ingredients JSON from AI response text
function extractIngredientsJSON(text) {
    if (!text) return null;
    // Look for a JSON block starting with ```json and ending with ```
    const regex = /```json\s*(\[.*\])\s*```/s; // s flag for dot matching newlines
    const match = text.match(regex);
    if (match && match[1]) {
        try {
            const jsonData = JSON.parse(match[1]);
            // Basic validation of the expected structure
            if (Array.isArray(jsonData) && jsonData.every(item =>
                item && typeof item.name === 'string' &&
                item.quantity !== undefined /*&& typeof item.unit === 'string'*/)) { // Relaxed unit check slightly
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

// Function to calculate cost from JSON ingredients using DB prices
// Requires Supabase client instance as argument
async function calculateCostFromJSON(ingredientsJson, supabase) {
    const debugDetails = {
        attempted: true,
        dbFetchSuccess: false,
        ingredientsFoundInDB: 0,
        itemsUsedInCalc: 0,
        calculatedValue: null,
        skippedItems: []
    };

    if (!supabase) {
        console.error("calculateCostFromJSON requires a valid Supabase client.");
        debugDetails.attempted = false;
        debugDetails.skippedItems.push({ reason: "NO_SUPABASE_CLIENT" });
        return { cost: null, debug: debugDetails };
    }
    if (!ingredientsJson || !Array.isArray(ingredientsJson) || ingredientsJson.length === 0) {
        debugDetails.attempted = false;
        return { cost: null, debug: debugDetails };
    }

    const ingredientNames = ingredientsJson.map(item => item.name).filter(name => name); // Filter out potentially null names
    if (ingredientNames.length === 0) {
        debugDetails.attempted = false;
        return { cost: null, debug: debugDetails };
    }

    let dbIngredients = [];
    try {
        console.log(`(calcFromJSON) Fetching DB prices for ${ingredientNames.length} ingredients...`);
        const { data, error } = await supabase
            .from('ingredients')
            .select('name, unit, price_per_unit')
            .in('name', ingredientNames);

        if (error) {
            console.error("(calcFromJSON) Supabase error fetching prices:", error);
            debugDetails.skippedItems.push({ reason: "DB_FETCH_ERROR", details: error.message });
            return { cost: null, debug: debugDetails };
        }
        dbIngredients = data || [];
        debugDetails.dbFetchSuccess = true;
        debugDetails.ingredientsFoundInDB = dbIngredients.length;
        console.log(`(calcFromJSON) Found ${dbIngredients.length} matching ingredients in DB.`);
    } catch (fetchError) {
        console.error("(calcFromJSON) Exception fetching prices:", fetchError);
        debugDetails.skippedItems.push({ reason: "DB_FETCH_EXCEPTION", details: fetchError.message });
        return { cost: null, debug: debugDetails };
    }

    let calculatedCost = 0;
    const dbPriceMap = new Map(dbIngredients.map(item => [item.name.toLowerCase(), item]));

    ingredientsJson.forEach(item => {
        const itemNameLower = item.name?.toLowerCase();
        const dbItem = itemNameLower ? dbPriceMap.get(itemNameLower) : null;
        let skipped = false;
        let reason = "";

        if (!itemNameLower) {
            reason = "MISSING_NAME_IN_JSON";
            skipped = true;
        } else if (!dbItem || dbItem.price_per_unit === null || dbItem.price_per_unit === undefined) {
            reason = "NOT_FOUND_IN_DB_OR_NO_PRICE";
            skipped = true;
        } else if (!item.unit || !dbItem.unit || String(item.unit).toLowerCase() !== String(dbItem.unit).toLowerCase()) {
            // Note: This version doesn't attempt unit conversion like getCostBreakdown's logic
            reason = `UNIT_MISMATCH (Recipe: '${item.unit}', DB: '${dbItem.unit}')`;
            skipped = true;
        } else {
            const quantity = Number(item.quantity);
            if (isNaN(quantity) || quantity <= 0) {
                reason = `INVALID_QUANTITY (${item.quantity})`;
                skipped = true;
            } else {
                const itemCost = quantity * dbItem.price_per_unit;
                calculatedCost += itemCost;
                debugDetails.itemsUsedInCalc++;
                // console.log(`(calcFromJSON) Using ${item.name} - Qty: ${quantity}, Unit: ${item.unit}, Cost: ${itemCost.toFixed(4)}`);
            }
        }

        if (skipped) {
            console.warn(`(calcFromJSON) Skipping ${item.name || 'N/A'} due to ${reason}`);
            debugDetails.skippedItems.push({ name: item.name || 'N/A', reason: reason });
        }
    });

    debugDetails.calculatedValue = calculatedCost;
    console.log(`(calcFromJSON) Total calculated: ${calculatedCost.toFixed(4)} from ${debugDetails.itemsUsedInCalc} items.`);

    // Only return a cost if at least one item was successfully used in calculation
    const finalCost = debugDetails.itemsUsedInCalc > 0 ? parseFloat(calculatedCost.toFixed(2)) : null;
    return { cost: finalCost, debug: debugDetails };
}

module.exports = {
    parseQuantityAndUnit,
    normalizeUnit,
    getConvertedQuantity,
    getAICostBreakdownEstimate,
    getAIEstimateForSpecificItems,
    extractTotalFromAIBreakdown,
    extractAICostEstimate,
    extractIngredientsJSON,
    calculateCostFromJSON
};
