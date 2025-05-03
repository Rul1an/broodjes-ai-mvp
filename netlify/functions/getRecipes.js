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
    console.error('Error in getRecipes function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch recipes' }),
    };
  }
};
