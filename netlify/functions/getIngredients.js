// Remove the direct require for createClient
// const { createClient } = require('@supabase/supabase-js');
// Require the client factory functions
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // Get the actual Supabase client using the service key
        const supabase = getServiceClient();

        // Check if the client was initialized successfully
        if (!supabase) {
            console.error('Failed to initialize Supabase service client.');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error', details: 'Supabase client could not be initialized.' }),
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
            throw error; // Re-throw the error to be caught by the outer catch block
        }

        return {
            statusCode: 200,
            // Ensure the body is stringified JSON
            body: JSON.stringify({ ingredients }),
            // It's good practice to set the content type header
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        // Log the caught error for debugging
        console.error('Error in getIngredients function execution:', error);
        // Return a more informative error response
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch ingredients', details: error.message || 'Unknown error' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};
