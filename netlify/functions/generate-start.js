// Serverless function to start the background recipe generation task
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
// const axios = require('axios'); // We sturen geen HTTP request meer naar de worker --> REMOVED OpenAI require

// REMOVED HELPER FUNCTION updateTask

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    let body;
    try {
        // Parse and validate request body
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        body = JSON.parse(event.body);

        const idea = body.idea;
        const requestedModel = body.model || 'gpt-3.5-turbo'; // Default model

        // Validate idea input
        if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Parameter "idea" must be a non-empty string.' }),
            };
        }

        // Validate model input
        const allowedModels = ['gpt-3.5-turbo', 'gpt-4o'];
        if (!allowedModels.includes(requestedModel)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `Unsupported model: ${requestedModel}` }),
            };
        }

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('[generate-start] Supabase URL or SERVICE_ROLE_KEY missing');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' }) // Keep simple error
            };
        }
        const supabase = createClient(supabaseUrl, supabaseKey);
        // REMOVED OpenAI client init

        // Generate a unique task ID for this job
        const taskId = uuidv4();
        console.log(`[generate-start] Received request for task: ${taskId}`);

        // Create a task record in Supabase to track status
        const { error: insertError } = await supabase
            .from('async_tasks')
            .insert([{ // Changed variable name from error to insertError
                task_id: taskId,
                idea: idea.trim(),
                model: requestedModel,
                status: 'pending', // Start as pending, worker picks it up
                created_at: new Date().toISOString()
                // Geen started_at hier, dat doet de worker
            }])
            .select()
            .single();

        if (insertError) {
            console.error(`[generate-start] Error creating task record in Supabase for ${taskId}:`, insertError);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to create task record' })
            };
        }

        console.log(`[generate-start] Task ${taskId} created with status 'pending'. Worker should pick this up.`);

        // Return success with the task ID immediately (202 Accepted)
        // De frontend gaat nu pollen via get-processed-recipe
        return {
            statusCode: 202, // Accepted
            body: JSON.stringify({
                message: 'Recipe generation task accepted',
                task_id: taskId
            })
        };
        // REMOVED OpenAI call and subsequent logic

    } catch (error) {
        // General catch block
        console.error('[generate-start] Error in handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error while processing request' })
        };
        // REMOVED outer catch logic that attempted to update task status
    }
};
