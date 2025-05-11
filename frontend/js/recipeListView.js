async function handleVisualizeBroodje(event) {
    const button = event.target;
    const listItem = button.closest('li');
    const taskId = listItem.dataset.taskId;
    const recipeTitle = listItem.querySelector('summary').textContent || listItem.dataset.recipeTitle; // Fallback if summary is not the title

    if (!taskId) {
        console.error('Geen taskId gevonden voor visualisatie');
        uiUtils.showError('Kon recept niet visualiseren: ID ontbreekt.');
        return;
    }

    button.disabled = true;
    button.textContent = 'Visualiseren...';

    try {
        console.log(`Visualiseren van broodje ${taskId}`);
        const result = await apiService.visualizeBroodje(taskId);
        if (result && result.imageUrl) {
            console.log('Visualization result:', result);
            // Gebruik de titel van het recept voor de modal caption
            uiUtils.showImageModal(result.imageUrl, `Visualisatie voor: ${recipeTitle}`);
        } else {
            throw new Error('Geen image URL ontvangen van de visualisatie API.');
        }
    } catch (error) {
        console.error(`Error visualizing broodje ${taskId}:`, error);
        uiUtils.showError(`Fout bij visualiseren: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = 'Visualiseer Broodje';
    }
}

function populateRecipeList(recipes) {
    // ... existing code ...
}
