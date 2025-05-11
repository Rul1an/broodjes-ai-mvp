import apiService from './apiService.js';
import uiUtils from './uiUtils.js';

let currentGeneratedTaskId = null;
let currentGeneratedRecipeTitle = null;

function displayGeneratedRecipe(data) {
    const outputDiv = document.getElementById('recept-output');
    const visualizeBtnArea = document.getElementById('visualize-broodje-area');

    if (data && data.recipe) {
        currentGeneratedTaskId = data.taskId; // Store taskId
        currentGeneratedRecipeTitle = data.recipe.title; // Store title
        outputDiv.innerHTML = marked.parse(data.recipe.markdown_recipe_string);
        visualizeBtnArea.style.display = 'block'; // Show the button area
    } else {
        outputDiv.innerHTML = '<p>Geen recept gevonden.</p>';
        currentGeneratedTaskId = null;
        currentGeneratedRecipeTitle = null;
        visualizeBtnArea.style.display = 'none'; // Hide button area if no recipe
    }
}

function displayCostBreakdown(taskId, costData) {
    const costOutputP = document.getElementById('estimated-cost-output');
    if (costData && costData.breakdown) {
        costOutputP.innerHTML = `<strong>Kostenspecificatie (Taak ID: ${taskId}):</strong><pre>${costData.breakdown}</pre>`;
    } else {
        costOutputP.innerHTML = `<strong>Kostenspecificatie voor ${taskId}:</strong> <p>Geen kostenspecificatie beschikbaar.</p>`;
    }
}

function setupGenerateView() {
    const generateButton = document.getElementById('generate-btn');
    const broodjeIdeeInput = document.getElementById('broodje-idee');
    const modelSelect = document.getElementById('model-select');
    const loadingDiv = document.getElementById('loading');
    const visualizeBtn = document.getElementById('visualize-generated-broodje-btn');

    generateButton.addEventListener('click', async () => {
        const idee = broodjeIdeeInput.value;
        const selectedModel = modelSelect.value;
        if (!idee) {
            uiUtils.showError("Voer alsjeblieft een broodjesidee in.");
            return;
        }

        generateButton.disabled = true;
        loadingDiv.style.display = 'block';
        document.getElementById('recept-output').innerHTML = '';
        document.getElementById('estimated-cost-output').innerHTML = '';
        document.getElementById('visualize-broodje-area').style.display = 'none'; // Verberg visualisatieknop bij nieuwe generatie

        try {
            const result = await apiService.generateRecipe(idee, selectedModel);
            displayGeneratedRecipe(result);
            // Nu de kosten ophalen en weergeven
            if (result.taskId) {
                const costResult = await apiService.getCostForTask(result.taskId);
                displayCostBreakdown(result.taskId, costResult);
            }
        } catch (error) {
            console.error('Fout bij genereren recept:', error);
            uiUtils.showError(error.message || 'Er ging iets mis bij het genereren van het recept.');
            document.getElementById('recept-output').innerHTML = `<p style="color: red;">Fout: ${error.message || 'Onbekende fout'}</p>`;
        } finally {
            generateButton.disabled = false;
            loadingDiv.style.display = 'none';
        }
    });

    // Event listener for the new visualize button
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
