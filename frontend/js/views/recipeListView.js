import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as api from '../apiService.js';
import * as ui from '../uiUtils.js';
import * as utils from '../utils.js';

// DOM Elements
let recipeListElement;
let clearRecipesBtn;
let recipeOutputElement; // General output area (used by displayRecipe)

// --- Display Functions (Exported for use by generateView too) ---

/**
 * Displays the generated recipe content in the main output area.
 * @param {object} data - The object containing recipe details and taskId from generateRecipe API.
 */
export function displayRecipe(data) {
    console.log("Displaying generated recipe:", data);
    if (!recipeOutputElement) {
        console.error("Recipe output element not found!");
        recipeOutputElement = document.getElementById('recept-output'); // Attempt to find it again
        if (!recipeOutputElement) return;
    }
    if (!data || !data.recipe) {
        recipeOutputElement.innerHTML = '<p style="color: red;">Kon recept data niet weergeven.</p>';
        return;
    }

    const formattedRecipe = utils.formatRecipeJsonToText(data.recipe);
    // Use marked.parse and render in a div, not pre
    recipeOutputElement.innerHTML = `
        <h2>${data.recipe.title || 'Nieuw Recept'}</h2>
        <div class="recipe-content">${marked.parse(formattedRecipe)}</div>
        <div id="cost-breakdown-${data.taskId}" class="cost-breakdown-section">
            <p><i>Kosten worden berekend...</i></p>
        </div>
    `;
}

/**
 * Displays the cost breakdown for a specific recipe.
 * @param {string} taskId - The ID of the task/recipe.
 * @param {object} breakdownData - The data returned from getCostBreakdown API (contains breakdown text or error).
 */
export function displayCostBreakdown(taskId, breakdownData) {
    console.log(`Displaying cost breakdown for ${taskId}:`, breakdownData);
    const costElement = document.getElementById(`cost-breakdown-${taskId}`);

    if (!costElement) {
        console.warn(`Cost breakdown element not found for taskId: ${taskId}`);
        // As a fallback, try appending to the main output if the recipe list isn't the active view?
        // Or maybe just log the warning.
        return;
    }

    if (breakdownData.error) {
        costElement.innerHTML = `<p style="color: red;">Fout bij kostenberekening: ${breakdownData.error}</p>`;
    } else if (breakdownData.breakdown) {
        // Use marked.parse and render in a div, not pre
        costElement.innerHTML = `
            <h3>Kosten Opbouw (${breakdownData.calculationType || 'N/A'})</h3>
            <div class="cost-content">${marked.parse(breakdownData.breakdown)}</div>
        `;
    } else {
        costElement.innerHTML = '<p><i>Kon kosten opbouw niet laden.</i></p>';
    }
}

// --- Saved Recipe List Functions ---

// Function to handle refining a recipe
const handleRefineRecipe = async (button) => {
    const listItem = button.closest('li[data-recipe-id]');
    if (!listItem) return;

    const recipeId = listItem.dataset.recipeId;
    const refineInput = listItem.querySelector('.refine-input');
    const refinementRequest = refineInput.value.trim();
    const refineLoading = listItem.querySelector('.refine-loading');
    const refinedOutput = listItem.querySelector('.refined-recipe-output');

    if (!refinementRequest) {
        alert('Voer een verfijningsverzoek in.');
        return;
    }

    ui.setButtonLoading(button, true, 'Verfijnen...');
    refineLoading.style.display = 'inline';
    refinedOutput.textContent = ''; // Clear previous output

    try {
        const result = await api.refineRecipe(recipeId, refinementRequest);
        refinedOutput.innerHTML = marked.parse(result.recipe);
        refinedOutput.style.color = '';
        refineInput.value = '';

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij verfijnen.';
        console.error(`Error refining recipe ${recipeId}:`, errorPayload);
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.setButtonLoading(button, false);
        refineLoading.style.display = 'none';
    }
};

// Function to load and display saved recipes
export async function loadRecipes() {
    if (!recipeListElement) {
        console.error("Recipe list element not found!");
        return;
    }
    ui.showListLoading();
    recipeListElement.innerHTML = ''; // Clear existing list

    try {
        const data = await api.getRecipes();

        if (data.recipes && data.recipes.length > 0) {
            data.recipes.forEach(recipe => {
                console.log("Processing recipe:", recipe); // Log the whole recipe object from API
                const listItem = document.createElement('li');
                listItem.dataset.recipeId = recipe.id; // Use mapped id

                let displayTitle = recipe.idea || 'Onbekend Recept';
                let parsedRecipe = null;
                try {
                    // Log the raw recipe string before parsing
                    console.log(`Recipe ID ${recipe.id} - Raw recipe JSON string:`, recipe.generated_recipe);
                    if (recipe.generated_recipe && typeof recipe.generated_recipe === 'string') {
                        parsedRecipe = JSON.parse(recipe.generated_recipe);
                    } else if (typeof recipe.generated_recipe === 'object') {
                        parsedRecipe = recipe.generated_recipe; // Already an object?
                    }
                    if (parsedRecipe && parsedRecipe.title) {
                        displayTitle = parsedRecipe.title;
                    }
                } catch (e) {
                    console.warn(`Recipe ID ${recipe.id}: Could not parse recipe JSON for title.`, e);
                }

                const formattedRecipeText = parsedRecipe ? utils.formatRecipeJsonToText(parsedRecipe) : 'Geen receptgegevens.';
                console.log(`Recipe ID ${recipe.id} - Formatted recipe text:`, formattedRecipeText); // Log formatted text

                const costBreakdownText = recipe.cost_breakdown;
                console.log(`Recipe ID ${recipe.id} - Raw cost breakdown text:`, costBreakdownText); // Log cost breakdown text

                // Parse content with marked
                const parsedRecipeHtml = formattedRecipeText ? marked.parse(formattedRecipeText) : '<i>Geen receptgegevens beschikbaar.</i>';
                const parsedCostBreakdownHtml = costBreakdownText ? marked.parse(costBreakdownText) : '<i>Geen kosten opbouw beschikbaar.</i>';

                listItem.innerHTML = `
                    <b>${displayTitle}</b>
                    <br>
                    <small>Opgeslagen op: ${new Date(recipe.created_at).toLocaleString('nl-NL')}</small>
                    <details style="margin-top: 10px;">
                        <summary>Bekijk Details (Recept & Kosten)</summary>
                        <h4>Recept</h4>
                        <div class="original-recipe-content">${parsedRecipeHtml}</div>
                        <h4 style="margin-top: 15px;">Kosten Opbouw</h4>
                        <div id="cost-breakdown-${recipe.id}" class="cost-breakdown-section">
                           ${parsedCostBreakdownHtml}
                        </div>
                        <div class="refine-section" style="margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 10px;">
                             <h4>Recept Verfijnen</h4>
                            <input type="text" class="refine-input" placeholder="Vraag om verfijning (bv. maak het pittiger)" style="width: 70%; margin-right: 5px;">
                            <button class="refine-btn">Verfijn Recept</button>
                            <div class="refine-loading" style="display: none; font-style: italic; color: #888;">Verfijnen...</div>
                            <div class="refined-recipe-output" style="margin-top: 5px; background-color: #eef; padding: 5px; border-radius: 3px;"></div>
                        </div>
                    </details>
                    `;
                recipeListElement.appendChild(listItem);
            });
        } else {
            recipeListElement.innerHTML = '<li>Nog geen recepten opgeslagen.</li>';
        }

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij ophalen recepten.';
        console.error('Error fetching recipes:', errorPayload);
        recipeListElement.innerHTML = '<li>Kon recepten niet laden.</li>';
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.hideListLoading();
    }
}

// Function to handle clearing all recipes
const handleClearAllRecipes = async () => {
    if (!confirm('WAARSCHUWING: Weet je zeker dat je ALLE opgeslagen recepten permanent wilt verwijderen?')) {
        return;
    }

    ui.setButtonLoading(clearRecipesBtn, true, 'Verwijderen...');
    ui.showListLoading();

    try {
        await api.clearAllRecipes();
        loadRecipes(); // Reload the (now empty) list

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij verwijderen recepten.';
        console.error('Error clearing recipes:', errorPayload);
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.setButtonLoading(clearRecipesBtn, false);
        ui.hideListLoading();
    }
};

// --- Initialization ---

// Use event delegation for refine buttons
function handleRecipeListClicks(event) {
    if (event.target.classList.contains('refine-btn')) {
        handleRefineRecipe(event.target);
    }
    // Add other delegated events here if needed (e.g., calculate cost)
}

export function setupRecipeListView() {
    console.log("Setting up Recipe List View...");
    recipeListElement = document.getElementById('recepten-lijst');
    clearRecipesBtn = document.getElementById('clear-recipes-btn');
    recipeOutputElement = document.getElementById('recept-output'); // Needed for displayRecipe

    if (!recipeListElement || !clearRecipesBtn || !recipeOutputElement) {
        console.error("Required elements for Recipe List View not found!");
        return;
    }

    clearRecipesBtn.addEventListener('click', handleClearAllRecipes);
    recipeListElement.addEventListener('click', handleRecipeListClicks); // Event delegation

    console.log("Recipe List View setup complete.");
    // Note: loadRecipes() is called by the navigation module when the view becomes active.
}
