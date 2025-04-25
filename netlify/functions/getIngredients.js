// netlify/functions/getIngredients.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase URL or Anon Key missing');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: ingredients, error } = await supabase
      .from('ingredients')
      .select('*') // Select all columns for ingredients
      .order('name', { ascending: true }); // Order alphabetically by name

    if (error) {
      console.error('Error fetching ingredients:', error);
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ingredients }),
    };
  } catch (error) {
    console.error('Error in getIngredients function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch ingredients' }) };
  }
};