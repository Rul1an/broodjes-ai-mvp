const { getOpenAIClient } = require('./openaiClient');

async function getAICostBreakdownEstimate(recipeJson) {
    const openai = getOpenAIClient();
    if (!openai) {
        console.error('Cannot estimate AI breakdown: OpenAI client not initialized.');
        return null;
    }
    if (!recipeJson || !recipeJson.ingredients || !Array.isArray(recipeJson.ingredients)) {
        console.error('Cannot estimate AI breakdown: Invalid recipe JSON format.');
        return null;
    }

    const ingredientsList = recipeJson.ingredients.map(ing => `- ${ing.quantity || ''} ${ing.name || 'Unknown'}`).join('\n');
    const title = recipeJson.title || 'Recept';

    const prompt = `
    Maak een geschatte kostenopbouw in Euro's (€) voor het recept "${title}" met de volgende ingrediënten, gebaseerd op gemiddelde Nederlandse supermarktprijzen. Geef een lijst per ingrediënt en een totaal.

    Formaat voorbeeld:
    ## Geschatte Kosten Opbouw:
    - Ingrediënt 1 (Hoeveelheid): €X.XX
    - Ingrediënt 2 (Hoeveelheid): €Y.YY
    - ...
    - **Totaal Geschat:** €Z.ZZ

    Ingrediënten:
    ${ingredientsList}

    Geef ALLEEN de kostenopbouw in dit formaat terug, zonder extra uitleg.
    `;

    try {
        console.log('Requesting AI cost breakdown estimation...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Je bent een assistent die kostenopbouwen voor recepten schat in Euro's. Reageer alleen met de gevraagde opbouw." },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        console.log('Raw AI cost breakdown response:', aiResponse);

        return aiResponse || null;

    } catch (error) {
        console.error('Error calling OpenAI API for AI cost breakdown:', error);
        return null;
    }
}

async function getAIEstimateForSpecificItems(failedItemsList) {
    const openai = getOpenAIClient();
    if (!openai) {
        console.error('Cannot estimate specific items: OpenAI client not initialized.');
        return null;
    }
    if (!failedItemsList || !Array.isArray(failedItemsList) || failedItemsList.length === 0) {
        console.warn('Cannot estimate specific items: Invalid or empty list provided.');
        return 0;
    }

    const ingredientsToEstimate = failedItemsList.map(item => `- ${item.quantity_string || ''} ${item.name || 'Unknown'} (${item.reason || 'reason unknown'})`).join('\n');

    const prompt = `
    Schat de gecombineerde kosten in Euro's (€) ALLEEN voor de volgende lijst met ingrediënten (hoeveelheden en redenen voor falen zijn ter info), gebaseerd op gemiddelde Nederlandse supermarktprijzen.

    Geef ALLEEN het totale geschatte numerieke bedrag terug (bijv. "3.45"). Geef GEEN valutasymbool, GEEN extra uitleg, GEEN lijst per item.

    Te schatten ingrediënten:
    ${ingredientsToEstimate}
    `;

    try {
        console.log(`Requesting AI cost estimation for ${failedItemsList.length} specific items...`);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Je bent een assistent die de gecombineerde kosten van een lijst ingrediënten schat in Euro's. Reageer ALLEEN met het totale numerieke bedrag (bv. 4.75)." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2,
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        console.log('Raw AI specific item cost response:', aiResponse);

        if (aiResponse) {
            const cost = parseFloat(aiResponse.replace(',', '.'));
            if (!isNaN(cost)) {
                console.log(`Parsed AI specific item cost: ${cost}`);
                return cost;
            }
        }
        console.error('Failed to parse numerical cost from AI response for specific items:', aiResponse);
        return null;

    } catch (error) {
        console.error('Error calling OpenAI API for specific item cost estimation:', error);
        return null;
    }
}

// --- Cost Extraction ---
function extractTotalFromAIBreakdown(breakdownText) {
    if (!breakdownText) return null;
    const regex = /(?:(?:\*\*)?(?:totaal|total)\s+(?:geschat|estimated)(?:\*\*)?)[:]?\s*(?:€|eur|euro)?\s*(\d+[.,]?\d*)/im;
    const match = breakdownText.match(regex);
    if (match && match[1]) {
        try {
            const costString = match[1].replace(',', '.');
            const cost = parseFloat(costString);
            if (!isNaN(cost)) {
                console.log(`Extracted AI Total: ${cost}`);
                return cost;
            }
        } catch (e) {
            console.error("Error parsing extracted AI total cost:", e);
        }
    }
    console.warn("Could not extract total cost from AI breakdown text:", breakdownText);
    return null;
}

module.exports = {
    getAICostBreakdownEstimate,
    getAIEstimateForSpecificItems,
    extractTotalFromAIBreakdown
};
