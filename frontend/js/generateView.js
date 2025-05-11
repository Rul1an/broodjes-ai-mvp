let currentGeneratedTaskId = null;
let currentGeneratedRecipeTitle = null;

function displayGeneratedRecipe(data) {
    const outputDiv = document.getElementById('recept-output');
    const costOutputP = document.getElementById('estimated-cost-output');
    const visualizeBtnArea = document.getElementById('visualize-broodje-area');
    const visualizeBtn = document.getElementById('visualize-generated-broodje-btn');

    if (data && data.recipe) {
        currentGeneratedTaskId = data.taskId; // Store taskId
        currentGeneratedRecipeTitle = data.recipe.title; // Store title
        outputDiv.innerHTML = marked.parse(data.recipe.markdown_recipe_string); // Assuming title is part of markdown
        // costOutputP.textContent = `Geschatte kosten: €${data.recipe.estimated_cost || 'N/A'}`;
        visualizeBtnArea.style.display = 'block'; // Show the button area
    } else {
        outputDiv.innerHTML = '<p>Geen recept gevonden.</p>';
        // costOutputP.textContent = '';
        currentGeneratedTaskId = null;
        currentGeneratedRecipeTitle = null;
        visualizeBtnArea.style.display = 'none'; // Hide button area if no recipe
    }
}

function displayCostBreakdown(taskId, costData) {
    // ... existing code ...
    generateButton.disabled = false;
});

// Event listener for the new visualize button
const visualizeBtn = document.getElementById('visualize-generated-broodje-btn');
visualizeBtn.addEventListener('click', async () => {
    if (!currentGeneratedTaskId || !currentGeneratedRecipeTitle) {
        console.error('Geen recept geselecteerd of titel beschikbaar voor visualisatie.');
        uiUtils.showError('Geen recept geselecteerd voor visualisatie.');
        return;
    }
    visualizeBtn.disabled = true;
    visualizeBtn.textContent = 'Visualiseren...';
    try {
        console.log(`Visualiseren van broodje met taskId: ${currentGeneratedTaskId}`);
        const result = await apiService.visualizeBroodje(currentGeneratedTaskId);
        if (result && result.imageUrl) {
            console.log('Visualization result:', result);
            uiUtils.showImageModal(result.imageUrl, `Visualisatie voor: ${currentGeneratedRecipeTitle}`);
        } else {
            throw new Error('Geen image URL ontvangen van de visualisatie API.');
        }
    } catch (error) {
        console.error('Error visualizing broodje:', error);
        uiUtils.showError(`Fout bij visualiseren: ${error.message}`);
    } finally {
        visualizeBtn.disabled = false;
        visualizeBtn.textContent = 'Visualiseer Broodje';
    }
});

console.log('Generate View setup complete.');
}

export default { setupGenerateView, displayGeneratedRecipe, displayCostBreakdown };
