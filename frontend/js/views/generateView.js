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
    // Display placeholder/loading state if needed
    try {
        const breakdownData = await api.getCostBreakdown(taskId);
        displayCostBreakdown(taskId, breakdownData);
    } catch (errorPayload) {
        // Use the message from the structured error object
        const errorMessage = errorPayload?.message || 'Onbekende fout bij ophalen kosten.';
        console.error(`Error fetching cost breakdown for ${taskId}:`, errorPayload); // Log the full payload
        displayCostBreakdown(taskId, { error: `Fout: ${errorMessage}` });
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
        const result = await api.generateRecipe(idea, selectedModel);

        if (!result || !result.recipe || !result.taskId) {
            throw new Error('Ongeldig antwoord ontvangen van de server.');
        }

        displayRecipe(result);
        await fetchCostBreakdown(result.taskId);

    } catch (errorPayload) {
        // Use the message from the structured error object
        const errorMessage = errorPayload?.message || 'Onbekende fout bij genereren.';
        console.error('Error generating recipe:', errorPayload); // Log the full payload
        ui.displayErrorToast(errorMessage);
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
