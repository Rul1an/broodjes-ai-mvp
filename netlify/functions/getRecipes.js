// netlify/functions/getRecipes.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
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

    // Fetch all recipes from the 'recipes' table, ordered by creation time descending
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, idea, generated_recipe, created_at') // Select specific columns
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recipes:', error);
      throw error;
    }

    // Return the fetched recipes
    return {
      statusCode: 200,
      body: JSON.stringify({ recipes }),
    };
  } catch (error) {
    console.error('Error in getRecipes function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch recipes' }),
    };
  }
};