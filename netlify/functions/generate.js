// Serverless function to generate recipes using OpenAI API and save to Supabase
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js'); // Import Supabase client

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    let supabase; // Define supabase client variable outside try block

    try {
        // Parse the request body
        const body = JSON.parse(event.body);
        const idea = body.idea;

        if (!idea) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No idea provided' }),
            };
        }

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL or Anon Key missing in generate function');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }
        supabase = createClient(supabaseUrl, supabaseAnonKey);

        // Construct the prompt for the AI
        const prompt = `
    Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '${idea}'.
    Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
    Beschrijf de bereidingsstappen duidelijk en beknopt.
    Houd het recept praktisch en gericht op een snelle bereiding.
    Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
    `;

        // Call OpenAI API
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            model: 'gpt-3.5-turbo',
        });

        const generated_recipe = chatCompletion.choices[0].message.content;

        // --- Save the generated recipe to Supabase --- 
        const { data: savedRecipe, error: saveError } = await supabase
            .from('recipes') // Make sure you have a 'recipes' table in Supabase
            .insert([
                { 
                    idea: idea, // The original idea
                    generated_recipe: generated_recipe // The AI-generated recipe text
                    // Add other fields like 'estimated_cost' here later if needed
                }
            ])
            .select(); // Return the inserted record

        if (saveError) {
            console.error('Error saving recipe to Supabase:', saveError);
            // Decide if you want to return an error or just the recipe if saving failed
            // For now, we log the error but still return the recipe
        }
        // ---------------------------------------------

        // Return the generated recipe (even if saving failed, maybe add a warning)
        return {
            statusCode: 200,
            body: JSON.stringify({ recipe: generated_recipe }),
        };
    } catch (error) {
        console.error('Error in generate function:', error);
        return {
            statusCode: 500,
            // Avoid exposing detailed internal errors to the client
            body: JSON.stringify({ error: 'Failed to generate or save recipe' }),
        };
    }
};