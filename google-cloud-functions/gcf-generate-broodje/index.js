const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const crypto = require('crypto');

// --- Environment Variables ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // Allow specific origin in production

// --- Initialize Clients ---
let supabase;
let openai;
try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase URL or Service Key missing.');
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('Supabase client initialized.');

    if (!OPENAI_API_KEY) throw new Error('OpenAI API Key missing.');
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('OpenAI client initialized.');
} catch (initError) {
    console.error('CRITICAL: Error initializing clients:', initError);
    // GCF will likely fail to serve requests if clients aren't ready.
}

// --- Cache Utilities (Adapted from cacheUtils.js) ---
const CACHE_TABLE = 'openai_cache';

function generatePromptHash(input) {
    let inputString;
    if (typeof input === 'string') {
        inputString = input;
    } else if (typeof input === 'object' && input !== null) {
        try {
            inputString = JSON.stringify(input); // Use standard stringify
            console.log("[Cache Debug] String being hashed:", inputString);
        } catch (e) {
            console.error("Failed to stringify input for hashing:", e);
            inputString = String(input); // Fallback
        }
    } else {
        inputString = String(input);
    }
    return crypto.createHash('sha256').update(inputString).digest('hex');
}

async function getCachedOpenAIResponse(promptHash) {
    if (!supabase) { console.error('Cache Error: Supabase client not ready.'); return null; }
    try {
        const { data, error } = await supabase.from(CACHE_TABLE).select('response').eq('prompt_hash', promptHash).maybeSingle();
        if (error) { console.error(`Cache Read Error for hash ${promptHash}:`, error); return null; }
        if (data && data.response) { console.log(`Cache Hit for hash: ${promptHash}`); return data.response; }
        console.log(`Cache Miss for hash: ${promptHash}`);
        return null;
    } catch (err) { console.error(`Unexpected Cache Read Error for hash ${promptHash}:`, err); return null; }
}

async function setCachedOpenAIResponse(promptHash, response) {
    if (!supabase) { console.error('Cache Error: Supabase client not ready.'); return; }
    try {
        const { error } = await supabase.from(CACHE_TABLE).insert({ prompt_hash: promptHash, response: response });
        if (error) {
            if (error.code === '23505') console.warn(`Cache Write Conflict for hash ${promptHash}:`, error.message);
            else console.error(`Cache Write Error for hash ${promptHash}:`, error);
        } else {
            console.log(`Cache Set Success for hash: ${promptHash}`);
        }
    } catch (err) { console.error(`Unexpected Cache Write Error for hash ${promptHash}:`, err); }
}

// --- HTTP Function Handler ---
functions.http('generateBroodjeRecipe', async (req, res) => {
    // --- CORS Handling ---
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
        return;
    }
    // --- End CORS Handling ---

    console.log('Received request:', req.method, req.url);

    // Only allow POST after handling OPTIONS
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // Check if clients initialized
    if (!supabase || !openai) {
        console.error('GCF Error: Clients not initialized properly.');
        return res.status(500).json({ error: 'Internal server configuration error.' });
    }

    let taskId = null; // To store the ID of the created task

    try {
        const body = req.body || {}; // Use req.body directly for GCF HTTP functions
        console.log('Parsed Body:', body);
        const { ingredients, type, language, model } = body;

        // Basic Input Validation
        if (!ingredients || typeof ingredients !== 'string' || ingredients.trim() === '') throw new Error('Input validation failed: Ingredients are required.');
        if (!type || typeof type !== 'string' || type.trim() === '') throw new Error('Input validation failed: Type is required.');
        const validatedLanguage = language || 'Nederlands';
        const requestedModel = model || "gpt-4o-mini";
        const modelToUse = ["gpt-4o", "gpt-4o-mini"].includes(requestedModel) ? requestedModel : "gpt-4o-mini";

        console.log(`Starting generation for: ${ingredients}, Model: ${modelToUse}`);

        // Prepare OpenAI Request & Check Cache
        const systemPrompt = `Je bent een expert in het bedenken van recepten. Genereer een recept gebaseerd op de volgende input. Geef ALLEEN een JSON-object terug met de volgende structuur: {"title": "Recept Titel", "description": "Korte omschrijving", "ingredients": [{"name": "Ingrediënt naam", "quantity": "Hoeveelheid (bv. 100g, 2 stuks)"}], "instructions": ["Stap 1", "Stap 2", ...]}. Gebruik de taal: ${validatedLanguage}.`;
        const userPrompt = `Ingrediënten: ${ingredients}. Type gerecht: ${type}. Taal: ${validatedLanguage}.`;
        const openAIRequestPayload = {
            model: modelToUse,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.7,
            response_format: { type: "json_object" },
        };
        const promptHash = generatePromptHash(openAIRequestPayload);

        let completion = await getCachedOpenAIResponse(promptHash);
        let recipeResultJson;

        if (completion) {
            // Cache Hit
            console.log(`Using cached OpenAI response for hash: ${promptHash}`);
            const aiResponseContent = completion.choices?.[0]?.message?.content;
            if (!aiResponseContent) throw new Error('Invalid cached OpenAI response structure.');
            try {
                recipeResultJson = JSON.parse(aiResponseContent);
            } catch (parseError) {
                console.error('Failed to parse cached OpenAI JSON response:', aiResponseContent);
                throw new Error('Cached OpenAI response contained invalid JSON.');
            }
        } else {
            // Cache Miss - Call OpenAI API
            console.log(`Cache miss for hash: ${promptHash}. Calling OpenAI API...`);
            completion = await openai.chat.completions.create(openAIRequestPayload);
            console.log('Received OpenAI response.');
            await setCachedOpenAIResponse(promptHash, completion); // Cache the raw response

            const aiResponseContent = completion.choices?.[0]?.message?.content;
            if (!aiResponseContent) throw new Error('OpenAI response did not contain content.');

            try {
                recipeResultJson = JSON.parse(aiResponseContent);
                console.log('Successfully parsed OpenAI JSON response.');
            } catch (parseError) {
                console.error('Failed to parse OpenAI JSON response:', aiResponseContent);
                throw new Error('OpenAI did not return valid JSON.');
            }
        }

        // Basic structure validation
        if (typeof recipeResultJson !== 'object' || !recipeResultJson?.title || !Array.isArray(recipeResultJson?.ingredients) || !Array.isArray(recipeResultJson?.instructions)) {
            throw new Error('OpenAI response has invalid structure.');
        }

        // Insert Task into Supabase
        console.log('Inserting generated recipe into async_tasks table...');
        const { data: insertData, error: insertError } = await supabase
            .from('async_tasks')
            .insert({
                idea: ingredients, status: 'completed', model: modelToUse,
                recipe: JSON.stringify(recipeResultJson) // Store as string
            })
            .select('task_id')
            .single();

        if (insertError) throw new Error(`Database error saving result: ${insertError.message}`);
        if (!insertData?.task_id) throw new Error('Failed to insert task or retrieve task ID from Supabase.');

        taskId = insertData.task_id;
        console.log(`Successfully inserted task with ID: ${taskId}`);

        // Success Response
        res.status(200).json({
            taskId: taskId,
            recipe: recipeResultJson, // Return the parsed recipe object
        });

    } catch (error) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[${errorTimestamp}] Error in generateBroodjeRecipe:`, error.message);
        console.error(`[${errorTimestamp}] Task ID at time of error:`, taskId);
        console.error(`[${errorTimestamp}] Full Error:`, error);

        // Attempt to update status if taskId is known
        if (taskId && supabase) {
            try {
                await supabase.from('async_tasks').update({ status: 'error', error_message: error.message }).eq('task_id', taskId);
            } catch (updateErr) { console.error(`[${errorTimestamp}] Failed to update task ${taskId} status to error:`, updateErr); }
        }

        // Error Response
        let statusCode = 500;
        let errorCode = "INTERNAL_ERROR";
        let userMessage = 'Failed to generate recipe due to an internal server error.';
        // Determine more specific errors if possible...
        if (error.message?.includes('OpenAI') || error.message?.includes('AI service error') || error.message?.includes('Image generation failed')) {
            statusCode = 502; errorCode = "AI_ERROR"; userMessage = 'Error communicating with AI service.';
        } else if (error.message?.includes('Database error') || error.message?.includes('Supabase')) {
            errorCode = "DATABASE_ERROR"; userMessage = 'A database error occurred.';
        } else if (error.message?.includes('Input validation failed') || error.message?.includes('Invalid JSON')) {
            statusCode = 400; errorCode = "INVALID_INPUT"; userMessage = error.message; // Use specific validation message
        }

        res.status(statusCode).json({
            error: { message: userMessage, code: errorCode, details: error.message },
            taskId: taskId
        });
    }
});
