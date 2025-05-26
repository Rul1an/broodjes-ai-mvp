const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event, context) => {
    console.log('AI-powered generate.js with database storage called');

    // CORS Headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Parse incoming request
        const body = JSON.parse(event.body || '{}');
        const { theme, extra_ingredients, style } = body;

        console.log('Request params:', { theme, extra_ingredients, style });

        // Build ingredients string for GCF call
        let ingredients = theme || 'klassiek broodje';
        if (extra_ingredients) {
            ingredients += `, ${extra_ingredients}`;
        }

        console.log('Calling GCF with ingredients:', ingredients);

        // Call Google Cloud Function for recipe generation
        const gcfUrl = process.env.GCF_URL;
        if (!gcfUrl) {
            throw new Error('GCF_URL environment variable not set');
        }

        const gcfResponse = await axios.post(gcfUrl, {
            ingredients,
            style: style || '',
            type: 'broodje'
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
        });

        const gcfData = gcfResponse.data;
        console.log('GCF Response received:', gcfData);

        if (!gcfData.taskId || !gcfData.recipe) {
            throw new Error('Invalid response from GCF: missing taskId or recipe');
        }

        // Prepare recipe data for database storage
        const { taskId, recipe } = gcfData;
        const { title, description, ingredients: recipeIngredients, instructions } = recipe;

        // Create markdown string
        const markdownRecipe = `# ${title}

## Beschrijving
${description}

## Ingrediënten
${recipeIngredients.map(ing => `- ${ing.name}: ${ing.quantity}`).join('\n')}

## Bereiding
${instructions.map((step, index) => `${index + 1}. ${step}`).join('\n')}`;

        // Calculate basic cost breakdown
        console.log('Calculating cost breakdown...');
        let costBreakdown = 'Kosten worden berekend... (gebruik de getCostBreakdown functie voor gedetailleerde berekening)';
        let costCalculationType = 'pending';

        try {
            // Get ingredient prices from database for initial cost estimate
            const { data: ingredientPrices, error: priceError } = await supabase
                .from('ingredients')
                .select('*');

            if (!priceError && ingredientPrices) {
                let totalCost = 0;
                let foundItems = 0;
                let unknownItems = [];

                const ingredientDetails = recipeIngredients.map(recipeIng => {
                    const foundIngredient = ingredientPrices.find(dbIng =>
                        dbIng.name.toLowerCase().includes(recipeIng.name.toLowerCase()) ||
                        recipeIng.name.toLowerCase().includes(dbIng.name.toLowerCase())
                    );

                    if (foundIngredient) {
                        // Simple quantity conversion for basic estimate
                        const quantity = parseFloat(recipeIng.quantity) || 1;
                        const cost = foundIngredient.price_per_unit * quantity;
                        totalCost += cost;
                        foundItems++;
                        return `${recipeIng.name}: €${cost.toFixed(2)} (${quantity} ${foundIngredient.unit} à €${foundIngredient.price_per_unit})`;
                    } else {
                        unknownItems.push(recipeIng.name);
                        return `${recipeIng.name}: Prijs onbekend`;
                    }
                });

                costBreakdown = `**Totale kostprijs: €${totalCost.toFixed(2)}**

**Ingrediënt Details:**
${ingredientDetails.join('\n')}`;

                costCalculationType = foundItems === recipeIngredients.length ? 'database' : 'hybrid';
            }
        } catch (costError) {
            console.error('Error calculating cost breakdown:', costError);
        }

        // Store the task in Supabase
        const taskData = {
            task_id: taskId,
            status: 'completed',
            idea: theme || null,
            model: 'gpt-4',
            recipe: JSON.stringify({
                title,
                markdown_recipe_string: markdownRecipe,
                ingredients: recipeIngredients,
                instructions
            }),
            error_message: null,
            estimated_cost: null,
            cost_breakdown: costBreakdown,
            cost_calculation_type: costCalculationType,
            broodje_image_url: null,
            generated_recipe: null // This column might exist, setting to null for safety
        };

        const { data: storedTask, error: storeError } = await supabase
            .from('async_tasks')
            .insert(taskData)
            .select()
            .single();

        if (storeError) {
            console.error('Error storing task:', storeError);
            // Don't throw error, continue to return the recipe
        } else {
            console.log('Task stored successfully:', storedTask);
        }

        // Return the complete response
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                taskId,
                status: 'completed',
                recipe: {
                    title,
                    description,
                    ingredients: recipeIngredients,
                    instructions,
                    markdown_recipe_string: markdownRecipe
                },
                cost_breakdown: costBreakdown,
                estimated_cost: null,
                broodje_image_url: null,
                error: null
            }),
        };

    } catch (error) {
        console.error('Error in generate function:', error);

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message,
                taskId: null,
                status: 'failed'
            }),
        };
    }
};
