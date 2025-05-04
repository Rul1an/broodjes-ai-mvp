// const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let body;

    try {
        // --- Input Parsing and Validation ---
        try {
            if (!event.body) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
            }
            body = JSON.parse(event.body);
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON format in request body.' }) };
        }

        const { name, unit, price_per_unit } = body;

        // Validate name (non-empty string)
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "name" must be a non-empty string.' }) };
        }
        const trimmedName = name.trim();

        // Validate unit (non-empty string)
        if (!unit || typeof unit !== 'string' || unit.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "unit" must be a non-empty string.' }) };
        }
        const trimmedUnit = unit.trim();

        // Validate price (presence, type, range)
        if (price_per_unit === undefined || price_per_unit === null) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "price_per_unit" is required.' }) };
        }
        const price = Number(price_per_unit);
        if (isNaN(price) || price < 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "price_per_unit" must be a non-negative number.' }) };
        }
        // -----------------------------------

        // Get the Supabase client using the shared factory (Service Role Key)
        const supabase = getServiceClient();
        if (!supabase) {
            console.error('addIngredient: Failed to initialize Supabase service client.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
        }

        const { data, error: dbError } = await supabase
            .from('ingredients')
            .insert([{ name: trimmedName, unit: trimmedUnit, price_per_unit: price }]) // Use trimmed values
            .select()
            .single(); // Expecting a single record back

        if (dbError) {
            console.error('Error adding ingredient to Supabase:', dbError);
            // Handle potential unique constraint violation gracefully
            if (dbError.code === '23505') { // PostgreSQL unique violation code
                return { statusCode: 409, body: JSON.stringify({ error: `Ingredient with name '${trimmedName}' already exists.` }) };
            }
            // Throw for generic catch block
            throw new Error(`Supabase DB error: ${dbError.message}`);
        }

        if (!data) {
            // Should not happen if insert succeeded without error, but good practice
            console.error('Supabase insert succeeded but returned no data.');
            throw new Error('Failed to retrieve saved ingredient data after insert.');
        }

        return {
            statusCode: 201, // Created
            body: JSON.stringify({ ingredient: data }),
        };

    } catch (error) {
        console.error('Error in addIngredient function handler:', error.message);
        // Provide more specific error message if possible, otherwise generic
        const clientErrorMessage = error.message.startsWith('Supabase DB error:') || error.message.includes('already exists')
            ? error.message // Pass specific DB errors
            : 'Failed to add ingredient due to an internal server error.';

        // Determine status code based on error type if needed, default 500
        const statusCode = error.message.includes('already exists') ? 409 : 500;

        return {
            statusCode: statusCode,
            body: JSON.stringify({ error: clientErrorMessage })
        };
    }
};
