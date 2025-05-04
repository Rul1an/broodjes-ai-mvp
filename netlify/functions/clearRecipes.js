// Remove the direct require for createClient
// const { createClient } = require('@supabase/supabase-js');
// Require the shared client factory function instead
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    // IMPORTANT: Use POST or DELETE for destructive actions, not GET
    if (event.httpMethod !== 'POST') {
        // Standard error for Method Not Allowed
        return {
            statusCode: 405,
            body: JSON.stringify({ error: { message: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' } }),
            headers: { 'Content-Type': 'application/json' }
        };
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

        // Delete all rows from the async_tasks table.
        // We can delete without a filter, but be cautious.
        console.log('Attempting to delete all rows from async_tasks...');
        const { error } = await supabase
            .from('async_tasks') // Corrected table name
            .delete()
            .neq('status', 'this_status_does_not_exist'); // Use a dummy condition to delete all rows

        if (error) {
            console.error('Error clearing async_tasks:', error);
            // Throw specific error for the catch block
            throw new Error(`Database error: ${error.message}`);
        }

        console.log('Successfully cleared async_tasks table.');
        return {
            statusCode: 200, // OK or 204 No Content could also be used
            body: JSON.stringify({ message: 'All tasks cleared successfully.' }), // Updated message
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        // Log the full error object for better debugging
        console.error('Error in clearRecipes function:', error);

        // Standard error structure for caught errors
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to clear tasks due to an internal server error.';

        if (error.message?.startsWith('Database error:')) {
            errorCode = "DATABASE_ERROR";
            userMessage = 'A database error occurred while clearing tasks.';
        }
        // Add more specific checks if needed

        return {
            statusCode: statusCode,
            body: JSON.stringify({
                error: {
                    message: userMessage,
                    code: errorCode,
                    details: error.message
                }
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};
