const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
// const { SecretManagerServiceClient } = require('@google-cloud/secret-manager'); // Uncomment if using Secret Manager

// TODO: Retrieve Supabase URL/Key (from env vars or Secret Manager)
const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // Use Service Role Key for updates
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // <<< ADD THIS
const openaiApiKey = process.env.OPENAI_API_KEY; // <<< Add OpenAI API Key env var

// TODO: Initialize Supabase client
let supabase;
// if (supabaseUrl && supabaseAnonKey) { // Use Service Key instead
if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('Supabase client initialized for cost calculation.');
} else {
    console.error('Missing Supabase credentials (URL or Service Role Key) for cost calculation function.');
}

// Initialize OpenAI client
let openai;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log('OpenAI client initialized for cost estimation.');
} else {
    console.warn('Missing OPENAI_API_KEY, AI cost estimation fallback will not be available.');
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

                        // --- !!! Use new Parsing Logic !!! ---
                        const { value: quantityValue, unit: quantityUnit } = parseQuantityAndUnit(recipeIngredient.quantity);

                        if (isNaN(quantityValue) || quantityUnit === null) {
                            console.warn(`Task ${task.task_id}: Could not parse quantity/unit '${recipeIngredient.quantity}' for ingredient '${recipeIngredient.name}'. Skipping cost for this item.`);
                            // calculationPossible = false; // Decide if one failure invalidates the whole cost
                            continue; // Skip cost calculation for this specific ingredient
                        }

                        // --- Basic Unit Comparison ---
                        // TODO: Add unit conversion logic (g <-> kg, ml <-> l) if needed
                        const dbUnitNormalized = dbIngredient.unit?.toLowerCase();
                        if (dbUnitNormalized !== quantityUnit) {
                            console.warn(`Task ${task.task_id}: Unit mismatch for '${recipeIngredient.name}'. Recipe unit: '${quantityUnit}', DB unit: '${dbUnitNormalized}'. Skipping cost for this item.`);
                            // calculationPossible = false; // Decide if one failure invalidates the whole cost
                            continue; // Skip cost calculation for this ingredient
                        }
                        // --- End Unit Comparison ---

                        // --- Calculate Cost ---
                        const ingredientCost = quantityValue * dbIngredient.price_per_unit;
                        if (isNaN(ingredientCost)) {
                            console.warn(`Task ${task.task_id}: Calculated NaN cost for '${recipeIngredient.name}'. Skipping cost for this item.`);
                            continue;
                        }
                        totalCost += ingredientCost;
                        // console.log(` - ${recipeIngredient.name}: ${quantityValue} ${quantityUnit} * ${dbIngredient.price_per_unit} = ${ingredientCost.toFixed(4)}`); // More detailed log if needed
                    }
                }

                // Only update if calculation was deemed possible/complete
                if (calculationPossible) {
                    console.log(`Task ${task.task_id}: Calculated total cost programmatically: ${totalCost.toFixed(2)}`);
                    updatePromises.push(
                        supabase
                            .from('async_tasks')
                            .update({ estimated_cost: totalCost.toFixed(2) })
                            .eq('task_id', task.task_id)
                    );
                    updatedCount++;
                } else {
                    console.log(`Task ${task.task_id}: Programmatic cost calculation failed or incomplete. Attempting AI estimation...`);
                    if (!openai) {
                        console.warn(`Task ${task.task_id}: OpenAI client not available, cannot estimate cost.`);
                        continue; // Skip update if AI client isn't configured
                    }
                    try {
                        const aiEstimate = await estimateCostWithAI(recipeJson);
                        if (aiEstimate !== null && !isNaN(aiEstimate)) {
                            console.log(`Task ${task.task_id}: AI estimated cost: ${aiEstimate.toFixed(2)}`);
                            updatePromises.push(
                                supabase
                                    .from('async_tasks')
                                    .update({ estimated_cost: aiEstimate.toFixed(2) })
                                    .eq('task_id', task.task_id)
                            );
                            updatedCount++;
                        } else {
                            console.warn(`Task ${task.task_id}: AI cost estimation failed or returned invalid result.`);
                            // Leave estimated_cost as null
                        }
                    } catch (aiError) {
                        console.error(`Task ${task.task_id}: Error during AI cost estimation:`, aiError);
                        // Leave estimated_cost as null
                    }
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

// --- Helper function for Quantity Parsing ---
function parseQuantityAndUnit(quantityString) {
    if (!quantityString || typeof quantityString !== 'string') {
        return { value: NaN, unit: null };
    }

    quantityString = quantityString.toLowerCase().trim();

    // Match number (integer or decimal with dot/comma)
    const numberMatch = quantityString.match(/^[\d.,]+/);
    if (!numberMatch) {
        // Handle cases like "snufje", "naar smaak" -> treat as unparsable for cost
        if (['snufje', 'naar smaak', 'beetje'].includes(quantityString)) {
            return { value: NaN, unit: quantityString }; // Return unit but NaN value
        }
        return { value: NaN, unit: null }; // Cannot find number
    }

    let value = parseFloat(numberMatch[0].replace(',', '.'));
    if (isNaN(value)) {
        return { value: NaN, unit: null };
    }

    // Extract unit string after the number
    let unit = quantityString.substring(numberMatch[0].length).trim();

    // Normalize common units
    switch (unit) {
        case 'g':
        case 'gram':
            unit = 'g';
            break;
        case 'kg':
        case 'kilogram':
            unit = 'kg';
            break;
        case 'l':
        case 'liter':
            unit = 'l';
            break;
        case 'ml':
        case 'milliliter':
            unit = 'ml';
            break;
        case 'el':
        case 'eetlepel':
        case 'eetlepels':
            unit = 'el'; // Represents ~15ml typically, but keep as 'el' for now
            break;
        case 'tl':
        case 'theelepel':
        case 'theelepels':
            unit = 'tl'; // Represents ~5ml typically, but keep as 'tl' for now
            break;
        case 'st':
        case 'stk':
        case 'stuk':
        case 'stuks':
            unit = 'stuks'; // Normalize piece units
            break;
        case '': // Handle cases where only a number is given (assume 'stuks'?)
            if (Number.isInteger(value)) {
                unit = 'stuks'; // Assume pieces if it's an integer with no unit
            } else {
                unit = null; // Unknown unit if just a decimal
            }
            break;
        // Add more normalizations if needed
    }

    return { value, unit };
}

// --- Helper function for AI Cost Estimation ---
async function estimateCostWithAI(recipeJson) {
    if (!openai) {
        console.error('Cannot estimate cost: OpenAI client not initialized.');
        return null;
    }
    if (!recipeJson || !recipeJson.ingredients || !Array.isArray(recipeJson.ingredients)) {
        console.error('Cannot estimate cost: Invalid recipe JSON format provided.');
        return null;
    }

    // Prepare ingredients list for the prompt
    const ingredientsList = recipeJson.ingredients.map(ing => `- ${ing.quantity || ''} ${ing.name || 'Unknown'}`).join('\n');

    const prompt = `
    Estimate the total cost in Euros (€) to prepare a recipe with the following ingredients based on average Dutch supermarket prices. Provide ONLY the numerical value (e.g., 4.50), without the currency symbol or any other text.

    Ingredients:
    ${ingredientsList}
    `;

    try {
        console.log('Requesting AI cost estimation...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use a cost-effective model
            messages: [
                { role: "system", content: "You are an assistant that estimates recipe costs in Euros. Respond with ONLY the numerical cost value." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2, // Low temperature for factual estimation
            max_tokens: 10, // Limit response length
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        console.log('Raw AI cost estimation response:', aiResponse);

        if (!aiResponse) {
            console.error('AI cost estimation returned empty response.');
            return null;
        }

        // Attempt to parse the response as a float
        const estimatedCost = parseFloat(aiResponse.replace(',', '.')); // Handle comma decimals

        if (isNaN(estimatedCost)) {
            console.error(`AI cost estimation did not return a valid number: "${aiResponse}"`);
            return null;
        }

        return estimatedCost;

    } catch (error) {
        console.error('Error calling OpenAI API for cost estimation:', error);
        return null;
    }
}
