const { getServiceClient } = require('./lib/supabaseClient');

// Store the GCF URL in an environment variable for flexibility
const GCF_IMAGE_GENERATION_URL = process.env.GCF_IMAGE_GENERATION_URL;

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: { message: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' } }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    if (!GCF_IMAGE_GENERATION_URL) {
        console.error('Missing GCF_IMAGE_GENERATION_URL environment variable.');
        return { statusCode: 500, body: JSON.stringify({ error: { message: 'Server configuration error', code: 'SERVER_CONFIG_ERROR', details: 'GCF URL not configured.' } }), headers: { 'Content-Type': 'application/json' } };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (parseError) {
        console.error("Error parsing request body:", parseError);
        return { statusCode: 400, body: JSON.stringify({ error: { message: 'Invalid JSON format in request body.', code: 'INVALID_INPUT', details: parseError.message } }), headers: { 'Content-Type': 'application/json' } };
    }

    const { ingredient_id } = body;

    if (!ingredient_id || typeof ingredient_id !== 'number' || !Number.isInteger(ingredient_id) || ingredient_id <= 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: { message: 'Valid positive integer "ingredient_id" is required in request body.', code: 'VALIDATION_ERROR', details: 'Field: ingredient_id' } }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    const supabase = getServiceClient();
    if (!supabase) {
        console.error('triggerIngredientImageGeneration: Failed to initialize Supabase service client.');
        return { statusCode: 500, body: JSON.stringify({ error: { message: 'Server configuration error', code: 'SERVER_CONFIG_ERROR', details: 'Supabase client could not be initialized.' } }), headers: { 'Content-Type': 'application/json' } };
    }

    try {
        // 1. Fetch ingredient name from Supabase
        console.log(`Fetching name for ingredient ID: ${ingredient_id}`);
        const { data: ingredientData, error: fetchError } = await supabase
            .from('ingredients')
            .select('name')
            .eq('id', ingredient_id)
            .maybeSingle();

        if (fetchError) {
            console.error(`Error fetching ingredient ${ingredient_id}:`, fetchError);
            throw new Error(`Database error fetching ingredient name: ${fetchError.message}`);
        }

        if (!ingredientData || !ingredientData.name) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: {
                        message: `Ingredient with ID ${ingredient_id} not found.`,
                        code: 'NOT_FOUND',
                        details: `ID: ${ingredient_id}`
                    }
                }),
                headers: { 'Content-Type': 'application/json' }
            };
        }
        const ingredient_name = ingredientData.name;
        console.log(`Found name: ${ingredient_name} for ID: ${ingredient_id}`);

        // 2. Trigger GCF (asynchronously - fire and forget)
        console.log(`Triggering GCF image generation for ${ingredient_name} (ID: ${ingredient_id})...`);
        // We don't await the fetch call here
        fetch(GCF_IMAGE_GENERATION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ingredient_id, ingredient_name })
        })
            .then(async response => {
                // Log GCF response status, but don't wait for it in the main handler response
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`GCF Call Failed (Status: ${response.status}) for ingredient ${ingredient_id}: ${errorText}`);
                } else {
                    console.log(`GCF triggered successfully (Status: ${response.status}) for ingredient ${ingredient_id}`);
                    // Optionally log response body if needed: const gcfResult = await response.json();
                }
            })
            .catch(fetchError => {
                // Log errors making the fetch call itself
                console.error(`Error triggering GCF for ingredient ${ingredient_id}:`, fetchError);
            });

        // 3. Return success immediately to the caller
        return {
            statusCode: 202, // Accepted: request accepted, processing started
            body: JSON.stringify({ message: 'Image generation triggered successfully.', ingredientId: ingredient_id }),
            headers: { 'Content-Type': 'application/json' }
        };

    } catch (error) {
        console.error(`Error in triggerIngredientImageGeneration for ID ${ingredient_id}:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: {
                    message: 'Internal server error while triggering image generation.',
                    code: 'INTERNAL_ERROR',
                    details: error.message
                }
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};
