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
    // Include a placeholder for the cost breakdown, identifiable by taskId
    recipeOutputElement.innerHTML = `
        <h2>${data.recipe.title || 'Nieuw Recept'}</h2>
        <pre>${formattedRecipe}</pre>
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
        // Basic formatting, could be enhanced
        costElement.innerHTML = `
            <h3>Kosten Opbouw (${breakdownData.calculationType || 'N/A'})</h3>
            <pre>${breakdownData.breakdown}</pre>
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
        refinedOutput.textContent = result.recipe; // Display the raw refined text
        // Optionally extract and display cost again?
        // const cost = utils.extractEstimatedCost(result.recipe);
        // console.log("Estimated cost from refined text:", cost);
        refineInput.value = ''; // Clear input

    } catch (error) {
        console.error(`Error refining recipe ${recipeId}:`, error);
        refinedOutput.textContent = `Fout bij verfijnen: ${error.message}`;
        refinedOutput.style.color = 'red';
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
                const listItem = document.createElement('li');
                listItem.dataset.recipeId = recipe.task_id; // Corrected key
                // Store original JSON safely if needed, careful with large data
                // listItem.dataset.recipeJson = recipe.recipe;

                let displayTitle = recipe.prompt || 'Onbekend Recept';
                let parsedRecipe = null;
                try {
                    if (recipe.recipe && typeof recipe.recipe === 'string') {
                        parsedRecipe = JSON.parse(recipe.recipe);
                    } else if (typeof recipe.recipe === 'object') {
                        parsedRecipe = recipe.recipe; // Already an object
                    }
                    if (parsedRecipe && parsedRecipe.title) {
                        displayTitle = parsedRecipe.title;
                    }
                } catch (e) {
                    console.warn(`Recipe ID ${recipe.task_id}: Could not parse recipe JSON for title.`, e);
                    // displayTitle remains recipe.prompt or default
                }

                const formattedRecipeText = parsedRecipe ? utils.formatRecipeJsonToText(parsedRecipe) : (recipe.recipe || 'Geen recept data.');
                const costBreakdownText = recipe.cost_breakdown || 'Geen kosten opbouw beschikbaar.';

                listItem.innerHTML = `
                    <b>${displayTitle}</b>
                    <br>
                    <small>Opgeslagen op: ${new Date(recipe.created_at).toLocaleString('nl-NL')}</small>
                    <div id="cost-breakdown-${recipe.task_id}" class="cost-breakdown-section" style="margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
                       ${costBreakdownText ? `<pre>${costBreakdownText}</pre>` : '<i>Kosten niet beschikbaar.</i>'}
                    </div>
                    <details style="margin-top: 10px;">
                        <summary>Bekijk Origineel / Verfijn</summary>
                        <pre class="original-recipe-text">${formattedRecipeText}</pre>
                        <div class="refine-section" style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;">
                            <input type="text" class="refine-input" placeholder="Vraag om verfijning (bv. maak het pittiger)" style="width: 70%; margin-right: 5px;">
                            <button class="refine-btn">Verfijn Recept</button>
                            <div class="refine-loading" style="display: none; font-style: italic; color: #888;">Verfijnen...</div>
                            <pre class="refined-recipe-output" style="margin-top: 5px; background-color: #eef;"></pre>
                        </div>
                    </details>
                    `;
                //<button class="calculate-actual-cost-btn" style="margin-left: 10px;" disabled title="Bereken werkelijke kosten (nog niet geïmplementeerd)">Bereken Kosten</button>
                recipeListElement.appendChild(listItem);
            });
        } else {
            recipeListElement.innerHTML = '<li>Nog geen recepten opgeslagen.</li>';
        }

    } catch (error) {
        console.error('Error fetching recipes:', error);
        recipeListElement.innerHTML = `<li>Kon recepten niet laden: ${error.message}</li>`;
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
        alert('Alle recepten zijn succesvol verwijderd.');
        loadRecipes(); // Reload the (now empty) list

    } catch (error) {
        console.error('Error clearing recipes:', error);
        alert(`Kon recepten niet verwijderen: ${error.message}`);
    } finally {
        ui.setButtonLoading(clearRecipesBtn, false);
        ui.hideListLoading(); // Hide list loading specifically
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
