const { createClient } = require('@supabase/supabase-js');

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
                continue;
            }

            // Find ingredient in DB
            const dbIngredient = ingredientPriceMap.get(ingredientName);
            if (!dbIngredient) {
                result.status = 'not_found';
                result.message = `Ingredient not found in database.`;
                breakdown.push(result);
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
                continue;
            }

            // Calculate cost for this ingredient
            const ingredientCost = quantityValue * dbIngredient.price_per_unit;
            if (isNaN(ingredientCost)) {
                result.status = 'error';
                result.message = 'Calculated cost resulted in NaN.';
                breakdown.push(result);
                continue;
            }

            result.cost = parseFloat(ingredientCost.toFixed(4)); // Store cost with precision
            totalCalculatedCost += ingredientCost;
            breakdown.push(result); // Add successful result
        }

        console.log(`getCostBreakdown: Finished calculation for task ${taskId}. Total calculated cost: ${totalCalculatedCost}`);

        // 7. Return Response
        return {
            statusCode: 200,
            body: JSON.stringify({
                taskId: taskId,
                breakdown: breakdown,
                totalCalculatedCost: parseFloat(totalCalculatedCost.toFixed(2)) // Return total cost rounded
            }),
        };

    } catch (error) {
        console.error(`getCostBreakdown: Error processing taskId ${taskId}:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Failed to calculate cost breakdown: ${error.message}` }),
        };
    }
};
