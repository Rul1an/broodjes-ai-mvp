// netlify/functions/deleteIngredient.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'DELETE') { // Use DELETE for deletions
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Get ID from query string parameter, e.g., /api/deleteIngredient?id=123
    const id = event.queryStringParameters.id;

    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing ingredient ID' }) };
    }

    const { error } = await supabase
      .from('ingredients')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting ingredient:', error);
      throw error;
    }

    // It might be useful to check if a row was actually deleted, 
    // but Supabase delete doesn't directly return the count or data easily.
    // We assume success if no error occurred.

    return {
      statusCode: 204, // No Content (successful deletion)
      body: '', // No body needed for 204
    };
  } catch (error) {
    console.error('Error in deleteIngredient function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete ingredient' }) };
  }
};