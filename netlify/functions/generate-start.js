// Serverless function to start the background recipe generation task
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

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
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // DEBUG LOGGING: Print environment variables received by the function
        console.log('DEBUG: Received SUPABASE_URL:', supabaseUrl ? 'Set' : 'Not Set or Empty');
        console.log('DEBUG: Received SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Set (length: ' + supabaseKey.length + ')' : 'Not Set or Empty');
        // Optional: Log a portion of the key to verify if it looks correct (be careful not to log the whole key)
        // console.log('DEBUG: Service Key starts with:', supabaseKey ? supabaseKey.substring(0, 5) : 'N/A');

        if (!supabaseUrl || !supabaseKey) {
            console.error('Supabase URL or Service Role Key missing in generate-start function');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Generate a unique task ID for this job
        const taskId = uuidv4();

        // Create a task record in Supabase to track status
        const { data, error } = await supabase
            .from('async_tasks')
            .insert([{
                task_id: taskId,
                idea: idea.trim(),
                model: requestedModel,
                status: 'pending',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating task record in Supabase:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to create task record' })
            };
        }

        // Invoke the background task asynchronously via our background function
        // This happens asynchronously and will not block the response
        fetch('/.netlify/functions/background_generate_go-background/main', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                task_id: taskId,
                idea: idea.trim(),
                model: requestedModel
            })
        }).catch(err => {
            console.error('Error invoking background function:', err);
            // We don't wait for this, so we just log the error
            // The task status will remain 'pending' in the database
        });

        // Return success with the task ID immediately
        return {
            statusCode: 202, // Accepted
            body: JSON.stringify({
                message: 'Recipe generation started',
                task_id: taskId
            })
        };

    } catch (error) {
        console.error('Error in generate-start function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error while processing request' })
        };
    }
};
