const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event, context) => {
    console.log('StartVisualizationTask function called');

    // CORS Headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        console.log('Supabase connected with Anon Key');
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Parse incoming request
        const body = JSON.parse(event.body || '{}');
        const { taskId } = body;

        if (!taskId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'taskId is required' }),
            };
        }

        console.log('Starting visualization for taskId:', taskId);

        // Get the task details from Supabase
        const { data: task, error: fetchError } = await supabase
            .from('async_tasks')
            .select('*')
            .eq('task_id', taskId)
            .single();

        if (fetchError) {
            throw new Error(`Failed to fetch task: ${fetchError.message}`);
        }

        if (!task) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Task not found' }),
            };
        }

        // Parse the recipe data
        const recipeData = JSON.parse(task.recipe);

        // Call Google Cloud Function for image generation
        console.log('Triggering GCF for image generation...');
        const gcfUrl = process.env.GCF_VISUALIZATION_URL;
        if (!gcfUrl) {
            throw new Error('GCF_VISUALIZATION_URL environment variable not set');
        }

        const gcfResponse = await axios.post(gcfUrl, {
            taskId,
            recipe: recipeData,
            type: 'broodje'
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 second timeout for image generation
        });

        const gcfData = gcfResponse.data;
        console.log('GCF visualization completed successfully');

        // Update the task with the image URL
        if (gcfData.imageUrl) {
            const { error: updateError } = await supabase
                .from('async_tasks')
                .update({
                    broodje_image_url: gcfData.imageUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('task_id', taskId);

            if (updateError) {
                console.error('Error updating task with image URL:', updateError);
            } else {
                console.log('Successfully updated task with image URL:', gcfData.imageUrl);
            }
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                taskId,
                imageUrl: gcfData.imageUrl,
                status: 'completed'
            }),
        };

    } catch (error) {
        console.error('Error in startVisualizationTask:', error);

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            }),
        };
    }
};
