// const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        // Standard error for Method Not Allowed
        return {
            statusCode: 405,
            body: JSON.stringify({ error: { message: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' } }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    let body;

    try {
        // --- Input Parsing and Validation ---
        try {
            if (!event.body) {
                // Standard error for missing body
                return { statusCode: 400, body: JSON.stringify({ error: { message: 'Request body is missing.', code: 'INVALID_INPUT' } }), headers: { 'Content-Type': 'application/json' } };
            }
            body = JSON.parse(event.body);
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            // Standard error for invalid JSON
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Invalid JSON format in request body.', code: 'INVALID_INPUT', details: parseError.message } }), headers: { 'Content-Type': 'application/json' } };
        }

        const { name, unit, price_per_unit } = body;

        // Standard errors for validation failures
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "name" must be a non-empty string.', code: 'VALIDATION_ERROR', details: 'Field: name' } }), headers: { 'Content-Type': 'application/json' } };
        }
        const trimmedName = name.trim();

        if (!unit || typeof unit !== 'string' || unit.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "unit" must be a non-empty string.', code: 'VALIDATION_ERROR', details: 'Field: unit' } }), headers: { 'Content-Type': 'application/json' } };
        }
        const trimmedUnit = unit.trim();

        if (price_per_unit === undefined || price_per_unit === null) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "price_per_unit" is required.', code: 'VALIDATION_ERROR', details: 'Field: price_per_unit' } }), headers: { 'Content-Type': 'application/json' } };
        }
        const price = Number(price_per_unit);
        if (isNaN(price) || price < 0) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "price_per_unit" must be a non-negative number.', code: 'VALIDATION_ERROR', details: 'Field: price_per_unit' } }), headers: { 'Content-Type': 'application/json' } };
        }
        // -----------------------------------

        const supabase = getServiceClient();
        if (!supabase) {
            console.error('addIngredient: Failed to initialize Supabase service client.');
            // Standard error for config error
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: {
                        message: 'Server configuration error',
                        code: 'SERVER_CONFIG_ERROR',
                        details: 'Supabase client could not be initialized.'
                    }
                }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        const { data, error: dbError } = await supabase
            .from('ingredients')
            .insert([{ name: trimmedName, unit: trimmedUnit, price_per_unit: price }])
            .select()
            .single();

        if (dbError) {
            console.error('Error adding ingredient to Supabase:', dbError);
            if (dbError.code === '23505') {
                // Standard error for unique constraint violation
                return {
                    statusCode: 409,
                    body: JSON.stringify({
                        error: {
                            message: `Ingredient with name '${trimmedName}' already exists.`,
                            code: 'CONFLICT_DUPLICATE',
                            details: dbError.message
                        }
                    }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }
            // Throw specific error for generic catch block
            throw new Error(`Database error: ${dbError.message}`);
        }

        if (!data) {
            console.error('Supabase insert succeeded but returned no data.');
            // Throw specific error for generic catch block
            throw new Error('Database error: Failed to retrieve saved ingredient data after insert.');
        }

        // Success response (no change needed)
        // We capture the returned data which includes the new ID
        const newIngredient = data;

        // --- Trigger GCF Image Generation Asynchronously ---
        if (process.env.GCF_IMAGE_GENERATION_URL && process.env.URL) {
            try {
                const triggerUrl = new URL('/api/triggerImage', process.env.URL).toString();
                console.log(`Triggering async image generation for new ingredient: ${newIngredient.id} via ${triggerUrl}`);
                // Fire and forget - don't await
                fetch(triggerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ingredient_id: newIngredient.id })
                }).catch(triggerError => {
                    // Log errors from the trigger call itself, but don't fail the main request
                    console.error(`Failed to trigger image generation for ingredient ${newIngredient.id}:`, triggerError);
                });
            } catch (e) {
                console.error(`Error initiating trigger for image generation (ingredient ${newIngredient.id}):`, e);
            }
        } else {
            console.warn('GCF_IMAGE_GENERATION_URL or Netlify URL env var not set, skipping image generation trigger.');
        }
        // --- End Trigger ---

        return {
            statusCode: 201, // Created
            body: JSON.stringify({ ingredient: newIngredient }),
            headers: { 'Content-Type': 'application/json' }
        };

    } catch (e) {
        console.error('Error processing request:', e);
        // Standard error for generic catch block
        return { statusCode: 500, body: JSON.stringify({ error: { message: 'Internal Server Error', code: 'INTERNAL_SERVER_ERROR', details: e.message } }), headers: { 'Content-Type': 'application/json' } };
    }
};
