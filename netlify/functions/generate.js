// Serverless function to generate recipes, estimate cost, and save to Supabase
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to try and extract estimated cost from AI response (experimental)
function extractEstimatedCost(text) {
    // Look for patterns like "Geschatte totale kosten: €X.XX" or similar
    const regex = /(?:geschatte|estimated)\s+(?:totale)?\s*kosten\s*[:]?\s*(?:€|euro|eur)?\s*(\d+[.,]?\d*)/i;
    const match = text.match(regex);
    if (match && match[1]) {
        // Convert comma to dot for parseFloat
        const costString = match[1].replace(',', '.');
        const cost = parseFloat(costString);
        if (!isNaN(cost)) {
            return cost;
        }
    }
    // Fallback: Look for any currency amount mentioned near the end
    const fallbackRegex = /(?:€|euro|eur)?\s*(\d+[.,]?\d*)\s*(?:geschat|estimated)?$/i;
    const fallbackMatch = text.match(fallbackRegex);
    if (fallbackMatch && fallbackMatch[1]) {
         const costString = fallbackMatch[1].replace(',', '.');
         const cost = parseFloat(costString);
         if (!isNaN(cost)) {
            return cost;
        }
    }
    return null; // Return null if no cost found
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let supabase;

    try {
        const body = JSON.parse(event.body);
        const idea = body.idea;
        if (!idea) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No idea provided' }) };
        }

        // Initialize Supabase client (ensure variables are set in Netlify)
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server config error' }) };
        }
        supabase = createClient(supabaseUrl, supabaseAnonKey);

        // --- Updated Prompt --- 
        const prompt = `
        Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '${idea}'.
        Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
        Beschrijf de bereidingsstappen duidelijk en beknopt.
        Houd het recept praktisch en gericht op een snelle bereiding.
        Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
        
        VOEG OOK TOE:
        - Een *schatting* van de kostprijs voor elk individueel ingrediënt (bv. "(geschat €0.50)").
        - Een *schatting* van de totale kostprijs voor het broodje (bv. "Geschatte totale kosten: €X.XX").
        Baseer deze schattingen op algemene supermarktprijzen in Euro. Benadruk dat het schattingen zijn.
        `;
        // ---------------------

        // Call OpenAI API
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            model: 'gpt-3.5-turbo', // Or gpt-4o for potentially better estimation
        });

        const generated_recipe_text = chatCompletion.choices[0].message.content;

        // --- Try to extract estimated cost --- 
        const estimated_total_cost = extractEstimatedCost(generated_recipe_text);
        // ------------------------------------

        // --- Save to Supabase (with estimated cost) --- 
        const { data: savedRecipe, error: saveError } = await supabase
            .from('recipes') 
            .insert([
                { 
                    idea: idea, 
                    generated_recipe: generated_recipe_text, 
                    estimated_total_cost: estimated_total_cost // Save the extracted cost (can be null)
                }
            ])
            .select(); 

        if (saveError) {
            console.error('Error saving recipe to Supabase:', saveError);
            // Log error but continue
        }
        // ---------------------------------------------

        // Return both recipe and estimated cost
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                recipe: generated_recipe_text, 
                estimated_cost: estimated_total_cost // Send estimated cost to frontend
            }),
        };
    } catch (error) {
        console.error('Error in generate function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to generate or save recipe' }),
        };
    }
};