// Remove the direct require for createClient
// const { createClient } = require('@supabase/supabase-js');
// Require the client factory functions
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        // Consistent error structure for Method Not Allowed
        return {
            statusCode: 405,
            body: JSON.stringify({ error: { message: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' } }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    try {
        // Get the actual Supabase client using the service key
        const supabase = getServiceClient();

        // Check if the client was initialized successfully
        if (!supabase) {
            console.error('Failed to initialize Supabase service client.');
            // Standard error structure for config error
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

        // Now use the obtained client
        const { data: ingredients, error } = await supabase
            .from('ingredients')
            .select('*') // Select all columns for ingredients
            .order('name', { ascending: true }); // Order alphabetically by name

        if (error) {
            console.error('Error fetching ingredients:', error);
            // Throw a specific error type for the catch block to identify DB errors
            throw new Error(`Database error: ${error.message}`);
        }

        return {
            statusCode: 200,
            // Ensure the body is stringified JSON
            body: JSON.stringify({ ingredients }),
            // It's good practice to set the content type header
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error('Error in getIngredients function execution:', error);

        // Standard error structure for caught errors
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to fetch ingredients due to an internal server error.';

        if (error.message?.startsWith('Database error:')) {
            errorCode = "DATABASE_ERROR";
            userMessage = 'A database error occurred while fetching ingredients.';
        }
        // Add more specific checks if needed

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
