import * as api from '../apiService.js';
import * as ui from '../uiUtils.js';

// DOM Elements
let ingredientNameInput;
let ingredientUnitInput;
let ingredientPriceInput;
let addIngredientBtn;
let ingredientFeedback;
let ingredientTableBody;

// Function to render the ingredients table
function renderIngredientsTable(ingredients) {
    if (!ingredientTableBody) return;
    ingredientTableBody.innerHTML = ''; // Clear existing table body

    if (ingredients && ingredients.length > 0) {
        ingredients.forEach(ingredient => {
            const row = ingredientTableBody.insertRow();
            row.dataset.ingredientId = ingredient.id; // Add ID for easier deletion
            row.innerHTML = `
                <td>${ingredient.name}</td>
                <td>${ingredient.unit}</td>
                <td>${ingredient.price_per_unit.toFixed(4)}</td>
                <td>
                    <button class="delete-ingredient-btn" data-id="${ingredient.id}">Verwijder</button>
                    <!-- Edit button can be added later -->
                </td>
            `;
        });
    } else {
        const row = ingredientTableBody.insertRow();
        row.innerHTML = '<td colspan="4">Nog geen ingrediënten toegevoegd.</td>';
    }
}

// Function to fetch and display ingredients
export async function loadIngredients() {
    if (!ingredientTableBody) {
        console.error("Ingredient table body not found!");
        return;
    }
    ui.showIngredientsLoading();
    try {
        const data = await api.getIngredients();
        renderIngredientsTable(data.ingredients);
    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij ophalen ingrediënten.';
        console.error('Error fetching ingredients:', errorPayload);
        renderIngredientsTable([]);
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.hideIngredientsLoading();
    }
}

// Function to handle adding an ingredient
const handleAddIngredient = async () => {
    const name = ingredientNameInput.value.trim();
    const unit = ingredientUnitInput.value.trim();
    const price = ingredientPriceInput.value;

    if (!name || !unit || price === '') {
        alert('Vul alle velden in voor het ingrediënt.');
        return;
    }

    ui.setButtonLoading(addIngredientBtn, true, 'Toevoegen...');

    try {
        const data = await api.addIngredient(name, unit, parseFloat(price));
        await loadIngredients();

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij toevoegen.';
        console.error('Error adding ingredient:', errorPayload);
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.setButtonLoading(addIngredientBtn, false);
    }
};

// Function to handle deleting an ingredient
const handleDeleteIngredient = async (ingredientId, button) => {
    if (!ingredientId) return;

    if (!confirm(`Weet je zeker dat je het ingrediënt met ID ${ingredientId} wilt verwijderen?`)) {
        return;
    }

    ui.setButtonLoading(button, true, '...');

    try {
        await api.deleteIngredient(ingredientId);
        const row = button.closest('tr');
        if (row) {
            row.remove();
            return; // Exit early on success
        } else {
            await loadIngredients();
        }

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij verwijderen.';
        console.error(`Error deleting ingredient ${ingredientId}:`, errorPayload);
        ui.displayErrorToast(errorMessage);
    } finally {
        // Always re-enable the button if it still exists (e.g., if row removal failed or error occurred)
        // Check if the button's parent element still exists in the DOM
        if (button.isConnected) {
            ui.setButtonLoading(button, false);
        }
    }
};

// --- Initialization ---

// Use event delegation for delete buttons within the table body
function handleIngredientTableClicks(event) {
    if (event.target.classList.contains('delete-ingredient-btn')) {
        const ingredientId = event.target.dataset.id;
        handleDeleteIngredient(ingredientId, event.target);
    }
}

export function setupIngredientView() {
    console.log("Setting up Ingredient View...");
    ingredientNameInput = document.getElementById('ingredient-name');
    ingredientUnitInput = document.getElementById('ingredient-unit');
    ingredientPriceInput = document.getElementById('ingredient-price');
    addIngredientBtn = document.getElementById('add-ingredient-btn');
    ingredientFeedback = document.getElementById('ingredient-feedback');
    ingredientTableBody = document.querySelector('#ingredienten-tabel tbody');

    if (!ingredientNameInput || !ingredientUnitInput || !ingredientPriceInput || !addIngredientBtn || !ingredientFeedback || !ingredientTableBody) {
        console.error("Required elements for Ingredient View not found!");
        return; // Don't proceed if elements are missing
    }

    addIngredientBtn.addEventListener('click', handleAddIngredient);
    ingredientTableBody.addEventListener('click', handleIngredientTableClicks);

    console.log("Ingredient View setup complete.");
    // Note: loadIngredients() is called by the navigation module when the view becomes active.
}
