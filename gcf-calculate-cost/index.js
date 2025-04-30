const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
// const { SecretManagerServiceClient } = require('@google-cloud/secret-manager'); // Uncomment if using Secret Manager

// TODO: Retrieve Supabase URL/Key (from env vars or Secret Manager)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// TODO: Initialize Supabase client
let supabase;
if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
    console.error('Missing Supabase credentials for cost calculation function.');
}

/**
 * HTTP Cloud Function triggered by Cloud Scheduler (or manually).
 * Fetches completed tasks without costs, calculates costs, and updates them.
 *
 * @param {Object} req Cloud Functions request context.
 * @param {Object} res Cloud Functions response context.
 */
functions.http('calculateCost', async (req, res) => {
    if (!supabase) {
        console.error('Supabase client not initialized.');
        return res.status(500).send('Internal Server Error: Database client not configured.');
    }

    console.log('Starting cost calculation process...');

    try {
        // 1. Fetch tasks to process
        console.log('Fetching completed tasks without estimated cost...');
        const { data: tasks, error: fetchError } = await supabase
            .from('async_tasks')
            .select('task_id, recipe') // Select ID and the recipe JSON string
            .eq('status', 'completed')
            .is('estimated_cost', null); // Only fetch tasks where cost is not yet set
        // .limit(10); // Optional: Add a limit to process in batches

        if (fetchError) {
            console.error('Error fetching tasks:', fetchError);
            throw new Error(`Failed to fetch tasks: ${fetchError.message}`);
        }

        if (!tasks || tasks.length === 0) {
            console.log('No tasks found requiring cost calculation.');
            return res.status(200).send('No tasks to process.');
        }

        console.log(`Found ${tasks.length} tasks to calculate costs for.`);

        // 2. Fetch all ingredients (or do it per task if list is huge)
        console.log('Fetching ingredient prices...');
        const { data: ingredientsData, error: ingredientsError } = await supabase
            .from('ingredients')
            .select('name, price_per_unit, unit');

        if (ingredientsError) {
            console.error('Error fetching ingredients:', ingredientsError);
            throw new Error(`Failed to fetch ingredients: ${ingredientsError.message}`);
        }
        // Simple map for easier lookup (case-insensitive)
        const ingredientPriceMap = new Map(ingredientsData.map(ing => [ing.name.toLowerCase(), ing]));
        console.log(`Fetched ${ingredientPriceMap.size} ingredients from database.`);

        // 3. Process each task
        let updatedCount = 0;
        const updatePromises = [];

        for (const task of tasks) {
            if (!task.recipe) {
                console.warn(`Task ${task.task_id} has status 'completed' but no recipe data. Skipping cost calculation.`);
                continue;
            }

            try {
                const recipeJson = JSON.parse(task.recipe); // Parse the stored recipe string
                let totalCost = 0;
                let calculationPossible = true;

                if (!recipeJson.ingredients || !Array.isArray(recipeJson.ingredients)) {
                    console.warn(`Task ${task.task_id}: Recipe JSON has invalid ingredients format. Skipping cost calculation.`);
                    calculationPossible = false; // Mark as not possible
                } else {
                    console.log(`Calculating cost for task ${task.task_id}...`);
                    for (const recipeIngredient of recipeJson.ingredients) {
                        const ingredientName = recipeIngredient.name?.toLowerCase();
                        const dbIngredient = ingredientPriceMap.get(ingredientName);

                        if (!dbIngredient) {
                            console.warn(`Task ${task.task_id}: Ingredient '${recipeIngredient.name}' not found in database. Cannot calculate cost accurately.`);
                            calculationPossible = false; // Mark as potentially inaccurate/impossible
                            continue; // Skip this ingredient, maybe calculate others?
                        }

                        // --- !!! TODO: Implement Robust Quantity Parsing !!! ---
                        // This is the HARD part. How to parse "100g", "2 stuks", "1 el", "een snufje"?
                        // And match it with the dbIngredient.unit?
                        // For now, a placeholder that likely fails:
                        const quantity = parseFloat(recipeIngredient.quantity);
                        if (isNaN(quantity)) {
                            console.warn(`Task ${task.task_id}: Could not parse quantity '${recipeIngredient.quantity}' for ingredient '${recipeIngredient.name}'. Cannot calculate cost accurately.`);
                            calculationPossible = false;
                            continue;
                        }
                        // --- End Placeholder Parsing ---

                        // Basic cost calculation (assuming units match for now...)
                        const ingredientCost = quantity * dbIngredient.price_per_unit;
                        totalCost += ingredientCost;
                        console.log(` - ${recipeIngredient.name}: ${quantity} * ${dbIngredient.price_per_unit} = ${ingredientCost.toFixed(4)}`);
                    }
                }

                // Only update if calculation was deemed possible/complete
                if (calculationPossible) {
                    console.log(`Task ${task.task_id}: Calculated total cost: ${totalCost.toFixed(2)}`);
                    // Add update promise to array
                    updatePromises.push(
                        supabase
                            .from('async_tasks')
                            .update({ estimated_cost: totalCost.toFixed(2) })
                            .eq('task_id', task.task_id)
                    );
                    updatedCount++;
                } else {
                    console.log(`Task ${task.task_id}: Cost calculation skipped or incomplete due to missing data or parsing issues.`);
                    // Optionally update with a specific status or null cost?
                    // For now, we just don't update it.
                }

            } catch (parseError) {
                console.error(`Task ${task.task_id}: Failed to parse recipe JSON. Skipping cost calculation. Error:`, parseError);
                // Optionally update status to 'error'?
            }
        }

        // 4. Execute all update promises
        if (updatePromises.length > 0) {
            console.log(`Attempting to update costs for ${updatedCount} tasks...`);
            const results = await Promise.allSettled(updatePromises);
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const failedTaskId = tasks[index].task_id; // Find corresponding task ID
                    console.error(`Failed to update cost for task ${failedTaskId}:`, result.reason?.message || result.reason);
                }
            });
            console.log('Finished updating costs.');
        }

        res.status(200).send(`Cost calculation finished. Processed ${tasks.length} tasks, attempted to update ${updatedCount}.`);

    } catch (error) {
        console.error('Error during cost calculation process:', error);
        res.status(500).send(`Error calculating costs: ${error.message}`);
    }
});
