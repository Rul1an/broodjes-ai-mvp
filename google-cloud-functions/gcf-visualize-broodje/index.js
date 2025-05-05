const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const functions = require('@google-cloud/functions-framework');
const process = require('process');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase URL or Service Key not set in environment variables.");
    process.exit(1); // Exit if essential config is missing
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    console.error("OpenAI API Key not set in environment variables.");
    process.exit(1);
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// CORS Headers - Adjust origin as needed
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || "*", // Default to all if not set
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Adjust if needed
};

functions.http('visualizeBroodje', async (req, res) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        res.status(204).send('');
        return;
    }

    // Set CORS headers for the actual request
    res.set(corsHeaders);

    // Check for POST method
    if (req.method !== 'POST') {
        console.warn('Received non-POST request');
        return res.status(405).send({ error: 'Method Not Allowed' });
    }

    // Extract task_id from request body
    const { taskId } = req.body;
    if (!taskId) {
        console.error('Missing taskId in request body');
        return res.status(400).send({ error: 'Missing required field: taskId' });
    }

    console.log(`Received request to visualize broodje for taskId: ${taskId}`);

    try {
        // 1. Fetch the recipe JSON from Supabase
        console.log(`Fetching recipe for taskId: ${taskId}`);
        const { data: taskData, error: fetchError } = await supabase
            .from('async_tasks')
            .select('recipe, prompt, broodje_image_url') // Fetch recipe JSON, prompt, and existing image URL
            .eq('id', taskId)
            .single();

        if (fetchError) {
            console.error(`Error fetching task ${taskId}:`, fetchError);
            return res.status(500).send({ error: 'Failed to fetch recipe data', details: fetchError.message });
        }

        if (!taskData || !taskData.recipe) {
            console.error(`No recipe found for task ${taskId}`);
            return res.status(404).send({ error: 'Recipe not found for the given taskId' });
        }

        // Check if image already exists
        if (taskData.broodje_image_url) {
            console.log(`Image already exists for task ${taskId}. Returning existing URL.`);
            return res.status(200).send({ imageUrl: taskData.broodje_image_url });
        }

        const recipeJson = taskData.recipe;
        const originalPrompt = taskData.prompt; // Use original prompt for context if needed

        // 2. Generate a prompt for DALL-E
        let imagePrompt = `A delicious-looking, photorealistic image of a ${recipeJson.naam || 'sandwich'} based on the following description: ${originalPrompt}. Focus on the sandwich itself, perhaps on a simple plate or cutting board.`;
        imagePrompt = imagePrompt.substring(0, 990); // DALL-E 3 prompt limit
        console.log(`Generated DALL-E prompt: ${imagePrompt}`);

        // 3. Call OpenAI Image API
        console.log('Calling OpenAI Image API...');
        const imageResponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: imagePrompt,
            n: 1,
            size: "1024x1024",
            response_format: "url",
            quality: "standard",
        });

        if (!imageResponse || !imageResponse.data || !imageResponse.data[0] || !imageResponse.data[0].url) {
            console.error('Invalid response from OpenAI Image API:', imageResponse);
            throw new Error('Failed to generate image or extract URL from OpenAI response.');
        }

        const imageUrl = imageResponse.data[0].url;
        console.log(`Generated image URL: ${imageUrl}`);

        // 4. Update Supabase async_tasks table with the image URL
        console.log(`Updating task ${taskId} with image URL...`);
        const { error: updateError } = await supabase
            .from('async_tasks')
            .update({ broodje_image_url: imageUrl })
            .eq('id', taskId);

        if (updateError) {
            console.error(`Error updating task ${taskId} with image URL:`, updateError);
            // Log the error but still return the URL
        } else {
            console.log(`Successfully updated task ${taskId} with broodje_image_url.`);
        }

        // 5. Return the new image URL
        res.status(200).send({ imageUrl });

    } catch (error) {
        console.error(`Error processing visualize request for ${taskId}:`, error);
        res.status(500).send({ error: 'Failed to visualize broodje', details: error.message || 'Unknown error' });
    }
});
