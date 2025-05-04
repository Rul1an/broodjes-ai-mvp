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
    } catch (error) {
        console.error('Error fetching ingredients:', error);
        ingredientTableBody.innerHTML = `<tr><td colspan="4" style="color: red;">Kon ingrediënten niet laden: ${error.message}</td></tr>`;
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
    ingredientFeedback.style.display = 'none'; // Hide previous feedback

    try {
        const data = await api.addIngredient(name, unit, parseFloat(price)); // Ensure price is a number
        ingredientFeedback.textContent = `Ingrediënt '${data.ingredient.name}' succesvol toegevoegd!`;
        ingredientFeedback.style.color = 'green';
        ingredientFeedback.style.display = 'block';

        // Clear form and reload ingredients
        ingredientNameInput.value = '';
        ingredientUnitInput.value = '';
        ingredientPriceInput.value = '';
        await loadIngredients(); // Refresh the list

    } catch (error) {
        console.error('Error adding ingredient:', error);
        ingredientFeedback.textContent = `Fout bij toevoegen: ${error.message}`;
        ingredientFeedback.style.color = 'red';
        ingredientFeedback.style.display = 'block';
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

    // Disable the specific delete button
    ui.setButtonLoading(button, true, '...');

    try {
        await api.deleteIngredient(ingredientId);
        // Remove the row from the table directly for instant feedback
        const row = button.closest('tr');
        if (row) {
            row.remove();
        } else {
            // Fallback to reloading if row not found (shouldn't happen)
            await loadIngredients();
        }
        // Optionally show feedback message
        // ingredientFeedback.textContent = `Ingrediënt ${ingredientId} verwijderd.`;
        // ingredientFeedback.style.color = 'green';
        // ingredientFeedback.style.display = 'block';

    } catch (error) {
        console.error(`Error deleting ingredient ${ingredientId}:`, error);
        alert(`Kon ingrediënt niet verwijderen: ${error.message}`);
        // Re-enable button on error
        ui.setButtonLoading(button, false);
    }
    // No finally block needed for button state if row is removed on success
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
