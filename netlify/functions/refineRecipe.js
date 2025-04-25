// netlify/functions/refineRecipe.js
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function (kan gedeeld worden met generate.js in de toekomst)
function extractEstimatedCost(text) {
    const regex = /(?:geschatte|estimated)\s+(?:totale)?\s*kosten\s*[:]?\s*(?:€|euro|eur)?\s*(\d+[.,]?\d*)/i;
    const match = text.match(regex);
    if (match && match[1]) {
        const costString = match[1].replace(',', '.');
        const cost = parseFloat(costString);
        if (!isNaN(cost)) return cost;
    }
    const fallbackRegex = /(?:€|euro|eur)?\s*(\d+[.,]?\d*)\s*(?:geschat|estimated)?$/i;
    const fallbackMatch = text.match(fallbackRegex);
     if (fallbackMatch && fallbackMatch[1]) {
         const costString = fallbackMatch[1].replace(',', '.');
         const cost = parseFloat(costString);
         if (!isNaN(cost)) return cost;
    }
    return null;
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const originalRecipe = body.originalRecipe;
        const refinementRequest = body.refinementRequest;

        if (!originalRecipe || !refinementRequest) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing original recipe or refinement request' }) };
        }

        // --- Prompt for Refinement ---
        const prompt = `
        Hier is een bestaand broodjesrecept:
        --- RECEPT START ---
        ${originalRecipe}
        --- RECEPT EINDE ---

        Verzoek van de gebruiker: "${refinementRequest}"

        Pas het bovenstaande recept aan op basis van het verzoek van de gebruiker.
        Presenteer het volledige, bijgewerkte recept, inclusief:
        - Aangepaste ingrediëntenlijst (met geschatte hoeveelheden).
        - Aangepaste bereidingsstappen.
        - Eventueel bijgewerkte component suggesties.
        - Bijgewerkte geschatte tijd.
        - Bijgewerkte geschatte kosten (per ingrediënt en totaal, gebaseerd op algemene supermarktprijzen).
        
        Zorg ervoor dat de aanpassing duidelijk en logisch is verwerkt in het *gehele* recept. Gebruik dezelfde opmaak met duidelijke kopjes.
        `;
        // ---------------------------

        // Call OpenAI API
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            // Gebruik mogelijk een iets krachtiger model voor verfijning?
            model: 'gpt-3.5-turbo', 
        });

        const refined_recipe_text = chatCompletion.choices[0].message.content;

        // Try to extract estimated cost from the refined text
        const estimated_total_cost = extractEstimatedCost(refined_recipe_text);

        // Return refined recipe and its estimated cost
        // We slaan dit niet direct op, de gebruiker kan kiezen om dit te doen (toekomstige feature)
        return {
            statusCode: 200,
            body: JSON.stringify({
                recipe: refined_recipe_text,
                estimated_cost: estimated_total_cost
            }),
        };
    } catch (error) {
        console.error('Error in refineRecipe function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to refine recipe' }),
        };
    }
};