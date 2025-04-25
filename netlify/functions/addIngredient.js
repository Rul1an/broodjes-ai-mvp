// netlify/functions/addIngredient.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { name, unit, price_per_unit } = JSON.parse(event.body);

    // Basic validation
    if (!name || !unit || price_per_unit === undefined || price_per_unit === null) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    
    const price = parseFloat(price_per_unit);
    if (isNaN(price) || price < 0) {
         return { statusCode: 400, body: JSON.stringify({ error: 'Invalid price per unit' }) };
    }

    const { data, error } = await supabase
      .from('ingredients')
      .insert([{ name, unit, price_per_unit: price }])
      .select();

    if (error) {
      console.error('Error adding ingredient:', error);
      // Handle potential unique constraint violation gracefully
      if (error.code === '23505') { // PostgreSQL unique violation code
           return { statusCode: 409, body: JSON.stringify({ error: `Ingredient with name '${name}' already exists.` }) };
      }
      throw error;
    }

    return {
      statusCode: 201, // Created
      body: JSON.stringify({ ingredient: data[0] }),
    };
  } catch (error) {
    console.error('Error in addIngredient function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to add ingredient' }) };
  }
};