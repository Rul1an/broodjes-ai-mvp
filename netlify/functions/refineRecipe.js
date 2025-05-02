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
        Origineel Recept (kan JSON of platte tekst zijn):
        --- START ---
        ${trimmedOriginalRecipe}
        --- EINDE ---

        Verzoek Gebruiker: "${trimmedRefinementRequest}"

        Taak: Pas het originele recept aan volgens het verzoek van de gebruiker. Geef ALLEEN het volledig bijgewerkte recept terug als platte tekst. Gebruik de volgende Markdown-achtige opmaak:

        # [Nieuwe Recept Titel]

        [Optionele korte beschrijving]

        ## Ingrediënten:
        - [Hoeveelheid] [Ingrediënt 1]
        - [Hoeveelheid] [Ingrediënt 2]
        ...

        ## Bereiding:
        1. [Stap 1]
        2. [Stap 2]
        ...

        ## Component Suggesties: (Indien relevant)
        - [Suggestie 1]
        - [Suggestie 2]
        ...

        ## Geschatte Tijd:
        - [Tijd]

        ## Geschatte Kosten:
        # Bereken en vermeld hier de geschatte totale kosten in euro's. Bijvoorbeeld: "Geschatte totale kosten: €4.50"

        BELANGRIJK: Geef GEEN extra uitleg, GEEN inleidende zinnen, GEEN afsluitende zinnen en herhaal NIET de JSON structuur indien het origineel JSON was. Geef alleen het bijgewerkte recept in de gevraagde platte tekst opmaak.
        `;
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
