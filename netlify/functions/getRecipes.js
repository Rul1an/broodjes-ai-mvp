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
    // Initialize Supabase client
    // Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in Netlify environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase URL or Anon Key missing');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
