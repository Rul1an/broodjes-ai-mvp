const OpenAI = require('openai');

const openaiApiKey = process.env.OPENAI_API_KEY;
let client = null;

function getOpenAIClient() {
    if (!client) {
        if (openaiApiKey) {
            client = new OpenAI({ apiKey: openaiApiKey });
            console.log('OpenAI Client Initialized.');
        } else {
            console.error('CRITICAL: Missing OPENAI_API_KEY.');
            return null;
        }
    }
    return client;
}

module.exports = { getOpenAIClient };
