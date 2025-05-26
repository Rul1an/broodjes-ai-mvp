const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event, context) => {
  console.log('GetTaskStatus function called');

  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Extract taskId from URL path
    const pathParts = event.path.split('/');
    const taskId = pathParts[pathParts.length - 1];

    if (!taskId || taskId === 'getTaskStatus') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'taskId is required in URL path' }),
      };
    }

    console.log('Checking status for taskId:', taskId);

    // Get the task details from Supabase
    const { data: task, error: fetchError } = await supabase
      .from('async_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (fetchError) {
      console.error('Error fetching task:', fetchError);
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Task not found' }),
      };
    }

    if (!task) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Task not found' }),
      };
    }

    // Parse the recipe data if it exists
    let recipeData = null;
    if (task.recipe) {
      try {
        recipeData = JSON.parse(task.recipe);
      } catch (parseError) {
        console.error('Error parsing recipe data:', parseError);
      }
    }

    const responseData = {
      status: task.status,
      imageUrl: task.broodje_image_url,
      recipe: recipeData,
      error: task.error_message,
      cost_breakdown: task.cost_breakdown,
      estimated_cost: task.estimated_cost
    };

    console.log('Task status response:', responseData);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseData),
    };

  } catch (error) {
    console.error('Error in getTaskStatus:', error);

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
