const crypto = require('crypto');
const { getServiceClient } = require('./supabaseClient');

const CACHE_TABLE = 'openai_cache';

/**
 * Generates a SHA-256 hash for a given input string or object.
 * Objects are stringified consistently before hashing.
 * @param {string | object} input - The input to hash.
 * @returns {string} The SHA-256 hash as a hex string.
 */
function generatePromptHash(input) {
    let inputString;
    if (typeof input === 'string') {
        inputString = input;
    } else if (typeof input === 'object' && input !== null) {
        // Use standard stringify - should be consistent enough in Node.js
        inputString = JSON.stringify(input); // REMOVED sorting replacer
        // --- DEBUG LOG ---
        console.log("[Cache Debug] String being hashed:", inputString);
        // ---------------
    } else {
        // Handle other types or null/undefined if necessary, or throw error
        inputString = String(input); // Fallback: convert to string
    }
    return crypto.createHash('sha256').update(inputString).digest('hex');
}

/**
 * Retrieves a cached OpenAI response from the database.
 * @param {string} promptHash - The SHA-256 hash of the prompt.
 * @returns {Promise<object|null>} The cached response object or null if not found or error.
 */
async function getCachedOpenAIResponse(promptHash) {
    const supabase = getServiceClient();
    if (!supabase) {
        console.error('Cache Error: Supabase client not available.');
        return null;
    }

    try {
        const { data, error } = await supabase
            .from(CACHE_TABLE)
            .select('response')
            .eq('prompt_hash', promptHash)
            .maybeSingle();

        if (error) {
            console.error(`Cache Read Error for hash ${promptHash}:`, error);
            return null;
        }

        if (data && data.response) {
            console.log(`Cache Hit for hash: ${promptHash}`);
            // Assuming response is stored as JSONB
            return data.response;
        }

        console.log(`Cache Miss for hash: ${promptHash}`);
        return null;
    } catch (err) {
        console.error(`Unexpected Cache Read Error for hash ${promptHash}:`, err);
        return null;
    }
}

/**
 * Stores an OpenAI response in the database cache.
 * @param {string} promptHash - The SHA-256 hash of the prompt.
 * @param {object} response - The OpenAI response object to store (must be JSON serializable).
 * @returns {Promise<void>}
 */
async function setCachedOpenAIResponse(promptHash, response) {
    const supabase = getServiceClient();
    if (!supabase) {
        console.error('Cache Error: Supabase client not available.');
        return;
    }

    try {
        const { error } = await supabase
            .from(CACHE_TABLE)
            .insert({
                prompt_hash: promptHash,
                response: response // Store as JSONB
            });
        // Use upsert if you want to overwrite existing entries for the same hash
        // .upsert({ prompt_hash: promptHash, response: response });

        if (error) {
            // Log conflict errors separately, they are expected if multiple requests race
            if (error.code === '23505') { // Unique violation
                console.warn(`Cache Write Conflict (likely race condition) for hash ${promptHash}:`, error.message);
            } else {
                console.error(`Cache Write Error for hash ${promptHash}:`, error);
            }
        } else {
            console.log(`Cache Set Success for hash: ${promptHash}`);
        }
    } catch (err) {
        console.error(`Unexpected Cache Write Error for hash ${promptHash}:`, err);
    }
}

module.exports = {
    generatePromptHash,
    getCachedOpenAIResponse,
    setCachedOpenAIResponse
};
