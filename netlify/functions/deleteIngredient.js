// const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // --- Input Validation ---
        const idParam = event.queryStringParameters?.id; // Use optional chaining

        if (!idParam) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required query parameter "id".' }) };
        }

        // Validate if id is a positive integer
        const id = parseInt(idParam, 10);
        if (isNaN(id) || id <= 0 || String(id) !== idParam) { // Ensure it's a clean integer parse
            return { statusCode: 400, body: JSON.stringify({ error: 'Query parameter "id" must be a positive integer.' }) };
        }
        // ----------------------

        // --- Supabase Client Setup ---
        /*
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing in deleteIngredient function');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        */
        // ---------------------------

        // Get the Supabase client using the shared factory (Service Role Key)
        const supabase = getServiceClient();
        if (!supabase) {
            console.error('deleteIngredient: Failed to initialize Supabase service client.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
        }

        // --- Database Operation ---
        const { error: dbError } = await supabase
            .from('ingredients')
            .delete()
            .eq('id', id);
        // -------------------------

        if (dbError) {
            console.error('Supabase error deleting ingredient:', dbError);
            // Throw specific error for the catch block
            throw new Error(`Supabase DB error: ${dbError.message}`);
        }

        // Supabase delete doesn't easily confirm if a row was deleted vs not found.
        // Returning 204 implies success regardless.
        console.log(`Attempted to delete ingredient with ID: ${id}`);

        return {
            statusCode: 204, // No Content (successful deletion or row not found)
            body: '',
        };

    } catch (error) {
        console.error('Error in deleteIngredient function handler:', error.message);
        const clientErrorMessage = error.message.startsWith('Supabase DB error:')
            ? error.message // Pass specific DB errors
            : 'Failed to delete ingredient due to an internal server error.';

        return {
            statusCode: 500, // Keep 500 for unexpected errors
            body: JSON.stringify({ error: clientErrorMessage })
        };
    }
};
