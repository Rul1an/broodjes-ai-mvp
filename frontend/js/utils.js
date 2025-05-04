// Formats the recipe JSON object into a readable string representation
export function formatRecipeJsonToText(recipeJson) {
    if (!recipeJson || typeof recipeJson !== 'object') {
        return "Recept data is ongeldig of niet gevonden.";
    }

    let output = "";
    if (recipeJson.title) {
        output += `**${recipeJson.title}**\n\n`;
    }
    if (recipeJson.description) {
        output += `${recipeJson.description}\n\n`;
    }
    if (recipeJson.ingredients && recipeJson.ingredients.length > 0) {
        output += "**Ingrediënten:**\n";
        recipeJson.ingredients.forEach(ing => {
            output += `- ${ing.name}: ${ing.quantity} ${ing.unit || ''}\n`;
        });
        output += "\n";
    }
    if (recipeJson.instructions && recipeJson.instructions.length > 0) {
        output += "**Instructies:**\n";
        recipeJson.instructions.forEach((step, index) => {
            output += `${index + 1}. ${step}\n`;
        });
        output += "\n";
    }
    // Include other fields if necessary (e.g., prep_time, cook_time)

    return output.trim() || "Kon recept niet formatteren.";
}

// Extracts a potential estimated cost from a block of text (e.g., refined recipe output)
// Note: This is a simple regex and might not be robust.
// The backend /api/getCostBreakdown is the primary source for costs.
export function extractEstimatedCost(text) {
    if (!text || typeof text !== 'string') return null;

    // Look for patterns like "Geschatte kosten: €X.XX" or "Total Cost: €Y.YY"
    const costRegex = /(?:Geschatte kosten|Total Cost):?\s*€?\s*(\d+(?:[.,]\d{1,2})?)/i;
    const match = text.match(costRegex);

    if (match && match[1]) {
        // Convert comma decimal separator to dot if necessary
        const costString = match[1].replace(',', '.');
        const cost = parseFloat(costString);
        return isNaN(cost) ? null : cost;
    }

    return null; // No cost found matching the pattern
}
