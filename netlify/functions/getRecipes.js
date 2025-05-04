const { getServiceClient } = require('./lib/supabaseClient');

exports.handler = async function (event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Initialize Supabase client using the shared helper (uses Service Role Key)
    const supabase = getServiceClient();

    if (!supabase) {
      console.error('getRecipes: Supabase client failed to initialize.');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error (DB)' }) };
    }

    // Fetch COMPLETED TASKS, including the recipe JSON and estimated cost
    const { data: tasks, error } = await supabase
      .from('async_tasks')
      .select('task_id, idea, recipe, created_at, estimated_cost')
      .eq('status', 'completed')
      .not('recipe', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching completed tasks:', error);
      throw error;
    }

    // Map the data slightly to match what the frontend expects
    const recipesForFrontend = tasks.map(task => ({
      id: task.task_id,
      idea: task.idea,
      generated_recipe: task.recipe,
      created_at: task.created_at,
      estimated_total_cost: task.estimated_cost
    }));

    // Return the fetched tasks/recipes
    return {
      statusCode: 200,
      body: JSON.stringify({ recipes: recipesForFrontend }),
    };
  } catch (error) {
    // Verbeterde Logging
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] Error in getRecipes handler:`, error.message);
    console.error(`[${errorTimestamp}] Full Error:`, error); // Log full error object

    // Gestandaardiseerde Error Response
    let statusCode = 500;
    let errorCode = "INTERNAL_ERROR";
    let userMessage = 'Failed to retrieve recipes due to an internal server error.';

    // Specifieke error types (voornamelijk DB hier)
    if (error.message?.includes('Database error') || error.message?.includes('Supabase')) {
      errorCode = "DATABASE_ERROR";
      userMessage = 'A database error occurred while retrieving recipes.';
    }
    // Add more specific checks if needed

    return {
      statusCode: statusCode,
      headers: { 'Access-Control-Allow-Origin': '*' }, // Ensure CORS header
      body: JSON.stringify({
        error: {
          message: userMessage,
          code: errorCode,
          details: error.message // Include original message as detail
        }
        // Geen taskId nodig hier, want het is een lijst-request
      }),
    };
  }
};
