const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event, context) => {
    console.log('Visualize function called');

    // CORS Headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
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

        console.log('Visualizing taskId:', taskId);

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

        // For this simplified version, we'll just return the task data
        // In a more complex implementation, this could trigger additional visualization processing

        const recipeData = task.recipe ? JSON.parse(task.recipe) : null;

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                taskId,
                status: task.status,
                recipe: recipeData,
                imageUrl: task.broodje_image_url,
                cost_breakdown: task.cost_breakdown,
                estimated_cost: task.estimated_cost
            }),
        };

    } catch (error) {
        console.error('Error in visualize function:', error);

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
