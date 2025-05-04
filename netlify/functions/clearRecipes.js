// Remove the direct require for createClient
// const { createClient } = require('@supabase/supabase-js');
// Require the shared client factory function instead
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    // IMPORTANT: Use POST or DELETE for destructive actions, not GET
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Add authentication/authorization here in a real application
    // For now, we proceed, but this is insecure for production

    try {
        // --- Supabase Client Setup --- REMOVED ---
        /*
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        */
        // ---------------------------

        // Get the Supabase client using the shared factory (Service Role Key)
        const supabase = getServiceClient();
        if (!supabase) {
            console.error('clearRecipes: Failed to initialize Supabase service client.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
        }

        // Delete all rows from the async_tasks table.
        // We can delete without a filter, but be cautious.
        console.log('Attempting to delete all rows from async_tasks...');
        const { error } = await supabase
            .from('async_tasks') // Corrected table name
            .delete()
            .neq('status', 'this_status_does_not_exist'); // Use a dummy condition to delete all rows

        if (error) {
            console.error('Error clearing async_tasks:', error);
            throw new Error(`Database error: ${error.message}`); // Throw a more specific error
        }

        console.log('Successfully cleared async_tasks table.');
        return {
            statusCode: 200, // OK or 204 No Content could also be used
            body: JSON.stringify({ message: 'All tasks cleared successfully.' }), // Updated message
        };
    } catch (error) {
        console.error('Error in clearRecipes function:', error.message);
        const clientErrorMessage = error.message.startsWith('Database error:')
            ? error.message
            : 'Failed to clear tasks due to an internal server error.';
        return { statusCode: 500, body: JSON.stringify({ error: clientErrorMessage }) }; // Use more specific message
    }
};
