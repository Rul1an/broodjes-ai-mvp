const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// TODO: Load these from environment variables in production
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize clients (consider doing this outside the handler for reuse)
let supabase;
let openai;

try {
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        console.log('Supabase client initialized.');
    } else {
        console.error('Supabase URL or Service Key missing in environment variables.');
    }
    if (OPENAI_API_KEY) {
        openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        console.log('OpenAI client initialized.');
    } else {
        console.error('OpenAI API Key missing in environment variables.');
    }
} catch (initError) {
    console.error('Error initializing clients:', initError);
}


functions.http('generateIngredientImage', async (req, res) => {
    // --- Add CORS headers ---
    // Set CORS headers for all responses (including errors)
    // Replace '*' with your specific Netlify frontend URL in production for better security
    res.set('Access-Control-Allow-Origin', '*'); // Allows all origins for now
    // Or use: res.set('Access-Control-Allow-Origin', 'https://broodjes-ai-v2--broodjes-ai.netlify.app');

    // Handle OPTIONS preflight request
    if (req.method === 'OPTIONS') {
        // Send headers necessary for CORS preflight request
        res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); // Allow POST (and potentially GET/OPTIONS)
        res.set('Access-Control-Allow-Headers', 'Content-Type'); // Allow Content-Type header
        res.set('Access-Control-Max-Age', '3600'); // Cache preflight response for 1 hour
        res.status(204).send(''); // Respond with 204 No Content
        return; // Stop processing for OPTIONS request
    }
    // --- End CORS Handling ---

    console.log('Received request:', req.method, req.url);
    console.log('Body:', req.body);

    // --- Added check if not POST (after OPTIONS handled) ---
    if (req.method !== 'POST') {
        // Send 405 Method Not Allowed for non-POST/OPTIONS methods
        // CORS header already set above
        return res.status(405).send('Method Not Allowed');
    }
    // -------------------------------------------------------

    if (!supabase || !openai) {
        console.error('Clients not initialized properly.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { ingredient_id, ingredient_name } = req.body;

    if (!ingredient_id || !ingredient_name) {
        console.error('Missing ingredient_id or ingredient_name in request body.');
        return res.status(400).json({ error: 'Missing required fields: ingredient_id, ingredient_name' });
    }

    console.log(`Processing request for ingredient ID: ${ingredient_id}, Name: ${ingredient_name}`);

    // --- Image Generation Logic ---
    try {
        const imagePrompt = `Een professionele foto van alleen ${ingredient_name}, geschikt voor een recepten app, studio belichting, witte achtergrond.`;
        console.log(`Generating image with prompt: "${imagePrompt}"`);

        const imageResponse = await openai.images.generate({
            model: "dall-e-3", // Or "gpt-4o" if image generation is enabled for it
            prompt: imagePrompt,
            n: 1,
            size: "1024x1024", // Standard size for DALL-E 3
            response_format: "url",
            quality: "standard" // or "hd"
            // style: "vivid" or "natural"
        });

        const generatedImageUrl = imageResponse.data?.[0]?.url;

        if (!generatedImageUrl) {
            console.error('OpenAI image generation failed or did not return a URL.', imageResponse);
            throw new Error('Image generation failed.');
        }
        console.log(`Generated image URL: ${generatedImageUrl}`);

        // Update Supabase
        console.log(`Updating Supabase for ingredient ${ingredient_id}...`);
        const { error: updateError } = await supabase
            .from('ingredients')
            .update({ image_url: generatedImageUrl })
            .eq('id', ingredient_id);

        if (updateError) {
            console.error(`Failed to update image_url for ingredient ${ingredient_id}:`, updateError);
            // Return error, but image was generated (consider cleanup?)
            return res.status(500).json({ error: 'Failed to update ingredient image URL in database.', details: updateError.message });
        }

        console.log(`Successfully generated image and updated Supabase for ingredient ${ingredient_id}`);
        res.status(200).json({ success: true, imageUrl: generatedImageUrl });

    } catch (error) {
        console.error(`Error during image generation/update for ingredient ${ingredient_id}:`, error);
        let statusCode = 500;
        let userMessage = 'Internal server error during image processing.';

        if (error.message?.includes('Image generation failed')) {
            userMessage = 'Failed to generate image using AI service.';
            statusCode = 502; // Bad Gateway if AI service failed
        } else if (error.response) { // Check for OpenAI specific API errors
            console.error('OpenAI API Error details:', error.response.data);
            userMessage = `AI service error: ${error.response.data?.error?.message || error.message}`;
            statusCode = error.response.status || 502;
        }

        // Consider updating the ingredient with an error state or placeholder?
        res.status(statusCode).json({ error: userMessage, details: error.message });
    }
    // --- End Image Generation Logic ---
});
