import * as api from '../apiService.js';
import * as ui from '../uiUtils.js';
// Import display functions from recipeListView
import { displayCostBreakdown, displayRecipe } from './recipeListView.js';

// DOM Elements for the Generate View
let generateBtn;
let ideaInput;
let modelSelect;
let recipeOutput; // The general output area

// Function to fetch cost breakdown AFTER recipe generation
const fetchCostBreakdown = async (taskId) => {
    console.log(`Fetching cost breakdown for taskId: ${taskId}`);
    // Display placeholder/loading state in the specific cost area if needed
    // (Currently, displayCostBreakdown handles the output area)
    try {
        const breakdownData = await api.getCostBreakdown(taskId);
        displayCostBreakdown(taskId, breakdownData);
    } catch (error) {
        console.error(`Error fetching cost breakdown for ${taskId}:`, error);
        // Display error in the specific cost area
        displayCostBreakdown(taskId, { error: `Kon kosten niet ophalen: ${error.message}` });
    }
};

// Function to handle the generate recipe button click
const handleGenerateRecipe = async () => {
    const idea = ideaInput.value.trim();
    const selectedModel = modelSelect.value;

    if (!idea) {
        alert('Voer een idee of ingrediënten in.');
        return;
    }

    ui.showLoading();
    ui.setButtonLoading(generateBtn, true, 'Genereren...');
    recipeOutput.innerHTML = ''; // Clear previous output

    try {
        // Pass hardcoded 'broodje' as type to the api service
        const result = await api.generateRecipe(idea, 'broodje', selectedModel);

        if (!result || !result.recipe || !result.taskId) {
            throw new Error('Ongeldig antwoord ontvangen van de server.');
        }

        // Display the main recipe content
        displayRecipe(result); // Pass the whole result object

        // Immediately trigger cost breakdown fetch
        await fetchCostBreakdown(result.taskId);

    } catch (error) {
        console.error('Error generating recipe:', error);
        recipeOutput.innerHTML = `<p style="color: red;">Fout bij genereren: ${error.message}</p>`;
    } finally {
        ui.hideLoading();
        ui.setButtonLoading(generateBtn, false);
    }
};

// Initialization function for the Generate View
export function setupGenerateView() {
    console.log("Setting up Generate View...");
    generateBtn = document.getElementById('generate-btn');
    ideaInput = document.getElementById('broodje-idee');
    modelSelect = document.getElementById('model-select');
    recipeOutput = document.getElementById('recept-output'); // General output area

    if (!generateBtn || !ideaInput || !modelSelect || !recipeOutput) {
        console.error("Required elements for Generate View not found!");
        return;
    }

    generateBtn.addEventListener('click', handleGenerateRecipe);
    console.log("Generate View setup complete.");
}
