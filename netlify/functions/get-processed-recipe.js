const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
    // 1. Check HTTP Method (Allow GET) & Extract Task ID
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const taskId = event.queryStringParameters?.task_id;
    if (!taskId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing task_id query parameter' }) };
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('[get-processed-recipe] Missing Supabase environment variables.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 3. Query Task Status from Supabase
        console.log(`[get-processed-recipe] Checking status for task: ${taskId}`);
        const { data: taskData, error: taskError } = await supabase
            .from('async_tasks')
            .select('status, recipe, error_message')
            .eq('task_id', taskId)
            .single(); // Expect only one task

        if (taskError) {
            // Handle case where task_id doesn't exist (or other DB errors)
            if (taskError.code === 'PGRST116') { // PostgREST error code for 'Not Found'
                console.log(`[get-processed-recipe] Task not found: ${taskId}`);
                return { statusCode: 404, body: JSON.stringify({ status: 'not_found', message: `Task ${taskId} not found.` }) };
            }
            console.error(`[get-processed-recipe] Error fetching task ${taskId}:`, taskError);
            return { statusCode: 500, body: JSON.stringify({ error: 'Database error fetching task status' }) };
        }

        const { status, recipe: recipe_data, error_message } = taskData;

        // 4. Handle Different Statuses
        if (status === 'pending' || status === 'processing') {
            console.log(`[get-processed-recipe] Task ${taskId} is still ${status}.`);
            return { statusCode: 200, body: JSON.stringify({ status: status }) };
        }

        if (status === 'failed') {
            console.error(`[get-processed-recipe] Task ${taskId} failed: ${error_message}`);
            return { statusCode: 200, body: JSON.stringify({ status: 'failed', error: error_message || 'Task failed with unknown error' }) };
        }

        if (status === 'completed') {
            console.log(`[get-processed-recipe] Task ${taskId} completed. Processing result...`);
            if (!recipe_data) {
                console.error(`[get-processed-recipe] Task ${taskId} is completed but recipe data is empty.`);
                return { statusCode: 500, body: JSON.stringify({ status: 'error', error: 'Completed task has no result data.' }) };
            }

            let recipe;
            try {
                recipe = JSON.parse(recipe_data);
            } catch (parseError) {
                console.error(`[get-processed-recipe] Error parsing recipe_data JSON for task ${taskId}:`, parseError);
                return { statusCode: 500, body: JSON.stringify({ status: 'error', error: 'Failed to parse recipe data.' }) };
            }

            // 5. Fetch Ingredient Costs (Assuming 'ingredients' table exists)
            const ingredientNames = recipe.ingredienten?.map(ing => ing.naam).filter(Boolean) || [];
            let ingredientCosts = {};
            let totalCost = 0;

            if (ingredientNames.length > 0) {
                console.log(`[get-processed-recipe] Fetching costs for ingredients: ${ingredientNames.join(', ')}`);
                const { data: costData, error: costError } = await supabase
                    .from('ingredients') // AANNAME: Tabel heet 'ingredients'
                    .select('name, cost, unit') // AANNAME: Kolommen 'name', 'cost', 'unit'
                    .in('name', ingredientNames);

                if (costError) {
                    console.error(`[get-processed-recipe] Error fetching ingredient costs for task ${taskId}:`, costError);
                    // Optionally proceed without costs or return an error
                    return { statusCode: 500, body: JSON.stringify({ status: 'error', error: 'Database error fetching ingredient costs.' }) };
                }

                // Process costs and add to recipe ingredients
                const costMap = costData.reduce((map, item) => {
                    map[item.name] = { cost: item.cost, unit: item.unit };
                    return map;
                }, {});

                recipe.ingredienten = recipe.ingredienten.map(ing => {
                    const costInfo = costMap[ing.naam];
                    const ingredientCost = costInfo ? parseFloat(costInfo.cost || 0) : 0;
                    totalCost += ingredientCost; // Accumulate total cost
                    return {
                        ...ing,
                        cost: costInfo ? ingredientCost.toFixed(2) : 'N/A', // Add cost, formatted
                        unit: costInfo ? costInfo.unit : '' // Add unit
                    };
                });
                recipe.totalCost = totalCost.toFixed(2); // Add total cost to the recipe object

                console.log(`[get-processed-recipe] Successfully processed costs for task ${taskId}. Total: ${recipe.totalCost}`);

            } else {
                console.log(`[get-processed-recipe] No ingredients found in recipe for task ${taskId} to fetch costs for.`);
                recipe.totalCost = '0.00';
            }


            // 6. Return Processed Recipe
            return {
                statusCode: 200,
                body: JSON.stringify({
                    status: 'completed',
                    recipe: recipe // Return the modified recipe object
                })
            };
        }

        // Fallback for unknown status
        console.warn(`[get-processed-recipe] Unknown status '${status}' for task ${taskId}`);
        return { statusCode: 500, body: JSON.stringify({ status: 'error', error: `Unknown task status: ${status}` }) };

    } catch (error) {
        console.error(`[get-processed-recipe] Unhandled error processing task ${taskId}:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
