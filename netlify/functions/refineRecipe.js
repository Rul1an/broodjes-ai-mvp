const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to extract estimated cost (consider sharing/importing if used elsewhere)
function extractEstimatedCost(text) {
    if (!text) return null;
    // Regex tries to find "Geschatte/Estimated (totale) kosten: [€/euro/eur] X.XX"
    // Made the first part slightly more robust
    const regex = /(?:geschatt(?:e|e)|estimated)\s+(?:totale)?\s*kosten\s*[:]?\s*(?:€|euro|eur)?\s*(\d+[.,]?\d*)/i;
    const match = text.match(regex);
    if (match && match[1]) {
        const costString = match[1].replace(',', '.');
        const cost = parseFloat(costString);
        if (!isNaN(cost)) return cost;
    }
    // Fallback: Look for a euro amount possibly followed by "geschat" or "estimated"
    // This is less reliable and might need adjustment based on actual AI output variations.
    const fallbackRegex = /(?:€|euro|eur)?\s*(\d+[.,]?\d*)\s*(?:geschat|estimated)?$/im; // Added multiline flag
    const fallbackMatch = text.match(fallbackRegex);
    if (fallbackMatch && fallbackMatch[1]) {
        const costString = fallbackMatch[1].replace(',', '.');
        const cost = parseFloat(costString);
        if (!isNaN(cost)) return cost;
    }
    console.log("Could not extract cost from refined text using regex."); // Added log
    return null;
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let body;

    try {
        // --- Input Parsing and Validation ---
        try {
            if (!event.body) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
            }
            body = JSON.parse(event.body);
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON format in request body.' }) };
        }

        const { originalRecipe, refinementRequest } = body;

        // Validate originalRecipe
        if (!originalRecipe || typeof originalRecipe !== 'string' || originalRecipe.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "originalRecipe" must be a non-empty string.' }) };
        }
        const trimmedOriginalRecipe = originalRecipe.trim();

        // Validate refinementRequest
        if (!refinementRequest || typeof refinementRequest !== 'string' || refinementRequest.trim().length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parameter "refinementRequest" must be a non-empty string.' }) };
        }
        const trimmedRefinementRequest = refinementRequest.trim();
        // -----------------------------------

        // --- Prompt for Refinement ---
        const prompt = `
        Hier is een bestaand broodjesrecept:
        --- RECEPT START ---
        ${trimmedOriginalRecipe}
        --- RECEPT EINDE ---

        Verzoek van de gebruiker: "${trimmedRefinementRequest}"

        Pas het bovenstaande recept aan op basis van het verzoek van de gebruiker.
        Presenteer het volledige, bijgewerkte recept, inclusief:
        - Aangepaste ingrediëntenlijst (met geschatte hoeveelheden).
        - Aangepaste bereidingsstappen.
        - Eventueel bijgewerkte component suggesties.
        - Bijgewerkte geschatte tijd.
        - Bijgewerkte geschatte kosten (bv. "Geschatte totale kosten: €X.XX").

        Zorg ervoor dat de aanpassing duidelijk en logisch is verwerkt in het *gehele* recept. Gebruik dezelfde opmaak met duidelijke kopjes.
        `; // Simplified cost instruction slightly for potentially better adherence
        // ---------------------------

        // --- Call OpenAI API ---
        console.log("Calling OpenAI API for recipe refinement...");
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            // Consider using a potentially more capable model for refinement tasks
            model: 'gpt-3.5-turbo', // Or potentially 'gpt-4o' if available/needed
        });

        const refined_recipe_text = chatCompletion.choices[0]?.message?.content;

        // Check if response exists and has content
        if (!refined_recipe_text || refined_recipe_text.trim().length === 0) {
            console.error('OpenAI response was empty or did not contain recipe text.', chatCompletion);
            throw new Error('Failed to get valid refined recipe text from AI.');
        }
        console.log("Recipe refined by AI.");
        // -----------------------

        // --- Extract Cost & Return ---
        const estimated_total_cost = extractEstimatedCost(refined_recipe_text);
        console.log(`Extracted cost from refined recipe: ${estimated_total_cost}`); // Log result

        return {
            statusCode: 200,
            body: JSON.stringify({
                recipe: refined_recipe_text,
                estimated_cost: estimated_total_cost
            }),
        };
        // ---------------------------

    } catch (error) {
        console.error('Error in refineRecipe function handler:', error.message);
        // Check if it's an OpenAI specific error vs other errors
        let statusCode = 500;
        let clientErrorMessage = 'Failed to refine recipe due to an internal server error.';

        // Example: More specific error handling for OpenAI if needed
        // if (error instanceof OpenAI.APIError) { ... }

        // Pass AI communication errors more directly if they occur
        if (error.message.includes('Failed to get valid refined recipe text from AI')) {
            clientErrorMessage = error.message;
            statusCode = 502; // Bad Gateway might be appropriate if AI failed
        }

        const fullErrorDetails = error.response ? JSON.stringify(error.response.data) : error.stack;
        console.error('Full error details:', fullErrorDetails);

        return {
            statusCode: statusCode,
            body: JSON.stringify({ error: clientErrorMessage }),
        };
    }
};
