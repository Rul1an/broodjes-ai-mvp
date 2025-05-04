// const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'PUT') {
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

        const { id: idParam, name, unit, price_per_unit } = body;

        // Validate ID
        if (!idParam) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameter "id" in request body.' }) };
        }
        const id = parseInt(idParam, 10);
        if (isNaN(id) || id <= 0 || String(id) !== String(idParam)) { // Allow string or number ID from body, but validate parse
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "id" must be a positive integer.' }) };
        }

        // Construct update object and validate provided fields
        const updateData = {};
        let providedName = null;

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "name" must be a non-empty string if provided.' }) };
            }
            updateData.name = name.trim();
            providedName = updateData.name; // Keep track for duplicate check message
        }

        if (unit !== undefined) {
            if (typeof unit !== 'string' || unit.trim().length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "unit" must be a non-empty string if provided.' }) };
            }
            updateData.unit = unit.trim();
        }

        if (price_per_unit !== undefined && price_per_unit !== null) {
            const price = Number(price_per_unit);
            if (isNaN(price) || price < 0) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "price_per_unit" must be a non-negative number if provided.' }) };
            }
            updateData.price_per_unit = price;
        }

        // Check if any valid fields were provided for update
        if (Object.keys(updateData).length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields provided for update.' }) };
        }
        // -----------------------------------

        // --- Supabase Client Setup ---
        /*
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing in updateIngredient function');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        */
        // ---------------------------

        // Get the Supabase client using the shared factory (Service Role Key)
        const supabase = getServiceClient();
        if (!supabase) {
            console.error('updateIngredient: Failed to initialize Supabase service client.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
        }

        // --- Database Operation ---
        const { data, error: dbError } = await supabase
            .from('ingredients')
            .update(updateData)
            .eq('id', id)
            .select()
            .single(); // Expecting single result or null
        // -------------------------

        if (dbError) {
            console.error('Supabase error updating ingredient:', dbError);
            // Handle potential unique constraint violation if name is updated
            if (dbError.code === '23505') {
                const duplicateName = providedName || '(unknown - check DB)';
                return { statusCode: 409, body: JSON.stringify({ error: `Ingredient with name '${duplicateName}' already exists.` }) };
            }
            throw new Error(`Supabase DB error: ${dbError.message}`);
        }

        // Check if the ingredient was actually found and updated
        if (!data) {
            return { statusCode: 404, body: JSON.stringify({ error: `Ingredient with ID ${id} not found.` }) };
        }

        console.log(`Successfully updated ingredient with ID: ${id}`);
        return {
            statusCode: 200, // OK
            body: JSON.stringify({ ingredient: data }),
        };

    } catch (error) {
        console.error('Error in updateIngredient function handler:', error.message);
        const clientErrorMessage = error.message.startsWith('Supabase DB error:') || error.message.includes('already exists')
            ? error.message // Pass specific known errors
            : 'Failed to update ingredient due to an internal server error.';

        const statusCode = error.message.includes('already exists') ? 409 : 500;

        return {
            statusCode: statusCode,
            body: JSON.stringify({ error: clientErrorMessage })
        };
    }
};
