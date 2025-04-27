// Serverless function to check the status of background recipe generation tasks
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        // Extract task ID from path parameter
        const taskId = event.path.split('/').pop();

        if (!taskId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Task ID is required' })
            };
        }

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        // Gebruik de SERVICE_ROLE_KEY om RLS policies te omzeilen
        const supabaseKey = process.env.SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            // Update de error logging
            console.error('Supabase URL or SERVICE_ROLE_KEY missing in generate-status function');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Retrieve task status from the database
        const { data, error } = await supabase
            .from('async_tasks')
            .select('*')
            .eq('task_id', taskId)
            .single();

        if (error) {
            console.error('Error retrieving task status from Supabase:', error);
            if (error.code === 'PGRST116') {
                // No rows returned - task not found
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'Task not found' })
                };
            }
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to retrieve task status' })
            };
        }

        if (!data) {
            // Dit zou niet mogen gebeuren als .single() geen error gaf, maar voor de zekerheid
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Task not found' })
            };
        }

        // Format the response based on task status
        const response = {
            task_id: data.task_id,
            status: data.status,
            idea: data.idea,
            created_at: data.created_at
        };

        // Add appropriate data based on status
        if (data.status === 'completed') {
            response.recipe = data.recipe;
            response.estimated_cost = data.estimated_cost;
        } else if (data.status === 'failed') {
            response.error = data.error_message;
        }

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error in generate-status function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error while checking task status' })
        };
    }
};
