// netlify/functions/updateIngredient.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'PUT') { // Use PUT for updates
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { id, name, unit, price_per_unit } = JSON.parse(event.body);

    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing ingredient ID' }) };
    }
    
    // Construct update object only with provided fields
    const updateData = {};
    if (name) updateData.name = name;
    if (unit) updateData.unit = unit;
    if (price_per_unit !== undefined && price_per_unit !== null) {
        const price = parseFloat(price_per_unit);
        if (isNaN(price) || price < 0) {
             return { statusCode: 400, body: JSON.stringify({ error: 'Invalid price per unit' }) };
        }
        updateData.price_per_unit = price;
    }

    if (Object.keys(updateData).length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No fields provided for update' }) };
    }

    const { data, error } = await supabase
      .from('ingredients')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating ingredient:', error);
      // Handle potential unique constraint violation if name is updated
      if (error.code === '23505') { 
           return { statusCode: 409, body: JSON.stringify({ error: `Ingredient with name '${name}' already exists.` }) };
      }
      throw error;
    }

    if (!data || data.length === 0) {
       return { statusCode: 404, body: JSON.stringify({ error: 'Ingredient not found' }) };
    }

    return {
      statusCode: 200, // OK
      body: JSON.stringify({ ingredient: data[0] }),
    };
  } catch (error) {
    console.error('Error in updateIngredient function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update ingredient' }) };
  }
};