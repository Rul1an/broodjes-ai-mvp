// Remove the direct require for createClient
// const { createClient } = require('@supabase/supabase-js');
// Require the shared client instead
const supabase = require('../lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // Remove the logic for getting URL/Anon key and creating a local client
        /*
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        */

        // The supabase client is now required from the shared library
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
