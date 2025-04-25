// netlify/functions/clearRecipes.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  // IMPORTANT: Use POST or DELETE for destructive actions, not GET
  if (event.httpMethod !== 'POST') { 
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Add authentication/authorization here in a real application
  // For now, we proceed, but this is insecure for production

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase URL or Anon Key missing');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Delete all rows from the recipes table.
    // The `neq('id', -1)` is a common trick to apply delete to all rows 
    // when you don't have a specific filter but need one for the syntax.
    // Replace -1 with a value that an ID will never have.
    const { error } = await supabase
      .from('recipes')
      .delete()
      .neq('id', -1); 

    if (error) {
      console.error('Error clearing recipes:', error);
      throw error;
    }

    return {
      statusCode: 200, // OK or 204 No Content could also be used
      body: JSON.stringify({ message: 'All recipes cleared successfully.' }),
    };
  } catch (error) {
    console.error('Error in clearRecipes function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to clear recipes' }) };
  }
};