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
        return {
            statusCode: 201,
            body: JSON.stringify({ ingredient: data }),
            headers: { 'Content-Type': 'application/json' }
        };

    } catch (error) {
        console.error('Error in addIngredient function handler:', error.message);

        // Standard error structure for caught errors
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to add ingredient due to an internal server error.';

        if (error.message?.startsWith('Database error:')) {
            errorCode = "DATABASE_ERROR";
            userMessage = 'A database error occurred while adding the ingredient.';
        } else if (error.message?.includes('already exists')) { // Should be caught earlier, but as fallback
            statusCode = 409;
            errorCode = "CONFLICT_DUPLICATE";
            userMessage = 'Ingredient already exists.';
        }
        // Add more specific checks if needed (e.g., parsing errors if not caught earlier)

        return {
            statusCode: statusCode,
            body: JSON.stringify({
                error: {
                    message: userMessage,
                    code: errorCode,
                    details: error.message // Include original message as detail
                }
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};
