// const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'DELETE') {
        // Standard error for Method Not Allowed
        return {
            statusCode: 405,
            body: JSON.stringify({ error: { message: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' } }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    let ingredientIdForError = null; // Track ID for error context

    try {
        // --- Input Validation ---
        const idParam = event.queryStringParameters?.id;

        if (!idParam) {
            // Standard error for missing ID
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Missing required query parameter "id".', code: 'VALIDATION_ERROR', details: 'Field: id' } }), headers: { 'Content-Type': 'application/json' } };
        }

        const id = parseInt(idParam, 10);
        if (isNaN(id) || id <= 0 || String(id) !== idParam) {
            // Standard error for invalid ID
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Query parameter "id" must be a positive integer.', code: 'VALIDATION_ERROR', details: 'Field: id' } }), headers: { 'Content-Type': 'application/json' } };
        }
        ingredientIdForError = id; // Store valid ID
        // ----------------------

        const supabase = getServiceClient();
        if (!supabase) {
            console.error('deleteIngredient: Failed to initialize Supabase service client.');
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

        // --- Database Operation ---
        const { error: dbError } = await supabase
            .from('ingredients')
            .delete()
            .eq('id', id);
        // -------------------------

        if (dbError) {
            console.error('Supabase error deleting ingredient:', dbError);
            // Throw specific error for the catch block
            throw new Error(`Database error: ${dbError.message}`);
        }

        // Success response (no change needed)
        console.log(`Attempted to delete ingredient with ID: ${id}`);
        return {
            statusCode: 204, // No Content
            body: '',
        };

    } catch (error) {
        // Log the full error object for better debugging
        console.error('Error in deleteIngredient function handler:', error);

        // Standard error structure for caught errors
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to delete ingredient due to an internal server error.';

        if (error.message?.startsWith('Database error:')) {
            errorCode = "DATABASE_ERROR";
            userMessage = 'A database error occurred while deleting the ingredient.';
        }
        // Add more specific checks if needed

        return {
            statusCode: statusCode,
            body: JSON.stringify({
                error: {
                    message: userMessage,
                    code: errorCode,
                    details: error.message,
                    ingredientId: ingredientIdForError // Include ID if available
                }
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};
