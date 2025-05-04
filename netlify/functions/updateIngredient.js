// const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'PUT') {
        // Standard error for Method Not Allowed
        return {
            statusCode: 405,
            body: JSON.stringify({ error: { message: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' } }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    let body;
    let ingredientIdForError = null; // Track ID for error context

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

        const { id: idParam, name, unit, price_per_unit } = body;

        // Validate ID and store for potential error messages
        if (!idParam) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Missing required parameter "id" in request body.', code: 'VALIDATION_ERROR', details: 'Field: id' } }), headers: { 'Content-Type': 'application/json' } };
        }
        const id = parseInt(idParam, 10);
        if (isNaN(id) || id <= 0 || String(id) !== String(idParam)) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "id" must be a positive integer.', code: 'VALIDATION_ERROR', details: 'Field: id' } }), headers: { 'Content-Type': 'application/json' } };
        }
        ingredientIdForError = id; // Store valid ID

        // Construct update object and validate provided fields
        const updateData = {};
        let providedName = null;

        // Standard errors for validation failures
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "name" must be a non-empty string if provided.', code: 'VALIDATION_ERROR', details: 'Field: name' } }), headers: { 'Content-Type': 'application/json' } };
            }
            updateData.name = name.trim();
            providedName = updateData.name;
        }

        if (unit !== undefined) {
            if (typeof unit !== 'string' || unit.trim().length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "unit" must be a non-empty string if provided.', code: 'VALIDATION_ERROR', details: 'Field: unit' } }), headers: { 'Content-Type': 'application/json' } };
            }
            updateData.unit = unit.trim();
        }

        if (price_per_unit !== undefined && price_per_unit !== null) {
            const price = Number(price_per_unit);
            if (isNaN(price) || price < 0) {
                return { statusCode: 400, body: JSON.stringify({ error: { message: 'Parameter "price_per_unit" must be a non-negative number if provided.', code: 'VALIDATION_ERROR', details: 'Field: price_per_unit' } }), headers: { 'Content-Type': 'application/json' } };
            }
            updateData.price_per_unit = price;
        }

        if (Object.keys(updateData).length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: { message: 'No valid fields provided for update.', code: 'VALIDATION_ERROR', details: 'No fields to update' } }), headers: { 'Content-Type': 'application/json' } };
        }
        // -----------------------------------

        const supabase = getServiceClient();
        if (!supabase) {
            console.error('updateIngredient: Failed to initialize Supabase service client.');
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
        const { data, error: dbError } = await supabase
            .from('ingredients')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        // -------------------------

        if (dbError) {
            console.error('Supabase error updating ingredient:', dbError);
            if (dbError.code === '23505') {
                const duplicateName = providedName || '(unknown)';
                // Standard error for unique constraint violation
                return {
                    statusCode: 409,
                    body: JSON.stringify({
                        error: {
                            message: `Ingredient with name '${duplicateName}' already exists.`,
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
            // Standard error for not found
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: {
                        message: `Ingredient with ID ${id} not found.`,
                        code: 'NOT_FOUND',
                        details: `ID: ${id}`
                    }
                }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        // Success response (no change needed)
        const updatedIngredient = data;
        console.log(`Successfully updated ingredient with ID: ${id}`);

        // --- Trigger GCF Image Generation Asynchronously ---
        if (process.env.GCF_IMAGE_GENERATION_URL) {
            try {
                console.log(`Triggering async image generation for updated ingredient: ${updatedIngredient.id}`);
                // Fire and forget - don't await
                fetch('/api/triggerIngredientImageGeneration', { // Assuming relative path works
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ingredient_id: updatedIngredient.id })
                }).catch(triggerError => {
                    console.error(`Failed to trigger image generation for ingredient ${updatedIngredient.id}:`, triggerError);
                });
            } catch (e) {
                console.error(`Error initiating trigger for image generation (ingredient ${updatedIngredient.id}):`, e);
            }
        } else {
            console.warn('GCF_IMAGE_GENERATION_URL not set, skipping image generation trigger.');
        }
        // --- End Trigger ---

        return {
            statusCode: 200,
            body: JSON.stringify({ ingredient: updatedIngredient }),
            headers: { 'Content-Type': 'application/json' }
        };

    } catch (error) {
        // Log the full error object for better debugging
        console.error('Error in updateIngredient function handler:', error);

        // Standard error structure for caught errors
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to update ingredient due to an internal server error.';

        if (error.message?.startsWith('Database error:')) {
            errorCode = "DATABASE_ERROR";
            userMessage = 'A database error occurred while updating the ingredient.';
        } else if (error.message?.includes('already exists')) { // Should be caught earlier, but as fallback
            statusCode = 409;
            errorCode = "CONFLICT_DUPLICATE";
            userMessage = 'Ingredient already exists.';
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
