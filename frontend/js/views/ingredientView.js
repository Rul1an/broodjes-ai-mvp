import * as api from '../apiService.js';
import * as ui from '../uiUtils.js';
import { showConfirmationModal } from '../uiUtils.js';

// GCF Trigger URL - We halen dit nu op via apiService wanneer nodig
// let gcfTriggerUrl = null; // No longer needed as module variable

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

// Function to fetch and display ingredients (simplified, relies on apiService cache)
export async function loadIngredients() {
    if (!ingredientTableBody) {
        console.error("Ingredient table body not found!");
        return;
    }

    ui.showIngredientsLoading();

    try {
        console.log("Fetching ingredients (using apiService cache)...");
        const data = await api.getIngredients(); // apiService handles caching
        const ingredients = data.ingredients || [];
        renderIngredientsTable(ingredients);

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij ophalen ingrediënten.';
        console.error('Error fetching ingredients:', errorPayload);
        renderIngredientsTable([]);
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.hideIngredientsLoading();
    }
}

// Function to trigger the GCF for image generation
const triggerGcfImageGeneration = async (ingredientId, ingredientName) => {
    // Ensure config is loaded before accessing it
    try {
        await api.ensureConfigLoaded(); // Call the helper from apiService
    } catch (configError) {
        console.error("Failed to ensure config loaded for GCF trigger:", configError);
        ui.displayErrorToast("Kon configuratie niet laden voor beeldgeneratie.");
        return; // Stop if config fails
    }

    // Access the URL via the global appConfig object (managed by apiService)
    const gcfUrl = window.appConfig?.gcfImageUrl;

    if (!gcfUrl) {
        console.error("GCF Trigger URL (gcfImageUrl) not available in appConfig.");
        ui.displayErrorToast("Beeldgeneratie URL is niet geconfigureerd.");
        return;
    }

    console.log(`Triggering GCF (${gcfUrl}) for ingredient: ${ingredientName} (ID: ${ingredientId})`);
    try {
        const response = await fetch(gcfUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ingredient_id: ingredientId,
                ingredient_name: ingredientName,
            }),
        });

        if (!response.ok) {
            console.error(`GCF trigger failed with status ${response.status}:`, await response.text());
            ui.displayErrorToast(`Beeldgeneratie trigger mislukt (status ${response.status}).`);
        } else {
            console.log("GCF triggered successfully.");
        }
    } catch (error) {
        console.error("Error triggering GCF:", error);
        ui.displayErrorToast('Fout bij het triggeren van beeldgeneratie.');
    }
};

// Function to handle adding an ingredient
const handleAddIngredient = async () => {
    const name = ingredientNameInput.value.trim();
    const unit = ingredientUnitInput.value.trim();
    const priceString = ingredientPriceInput.value.trim().replace(',', '.'); // Allow comma as decimal separator

    // Basic check for empty fields
    if (!name || !unit || priceString === '') {
        alert('Vul alle velden in voor het ingrediënt.');
        return;
    }

    // Validate price is a non-negative number
    const price = parseFloat(priceString);
    if (isNaN(price) || price < 0) {
        alert('Prijs moet een geldig, niet-negatief getal zijn (bv. 1.25 of 0.50).');
        return;
    }

    ui.setButtonLoading(addIngredientBtn, true, 'Toevoegen...');

    try {
        // Use the validated price variable
        const data = await api.addIngredient(name, unit, price);
        console.log("Ingredient added successfully:", data);

        // Trigger GCF after successful addition
        if (data && data.ingredient && data.ingredient.id && data.ingredient.name) {
            triggerGcfImageGeneration(data.ingredient.id, data.ingredient.name); // Use data.ingredient
        } else {
            console.warn("Could not trigger GCF: Missing ID or Name in addIngredient response.", data);
        }

        await loadIngredients(); // Reload the list (will use cache if appropriate)
        // Clear input fields after successful addition
        ingredientNameInput.value = '';
        ingredientUnitInput.value = '';
        ingredientPriceInput.value = '';

    } catch (errorPayload) {
        const errorMessage = errorPayload?.message || 'Onbekende fout bij toevoegen.';
        console.error('Error adding ingredient:', errorPayload);
        ui.displayErrorToast(errorMessage);
    } finally {
        ui.setButtonLoading(addIngredientBtn, false);
    }
};

// Function to handle deleting an ingredient
async function handleDeleteIngredient(event) {
    const button = event.target;
    const ingredientId = button.dataset.id;
    const ingredientName = button.closest('tr').querySelector('td:first-child').textContent;

    showConfirmationModal(`Weet je zeker dat je ingrediënt "${ingredientName}" wilt verwijderen?`, async () => {
        console.log(`Confirmed deletion for ingredient: ${ingredientName} (ID: ${ingredientId})`);
        ui.setButtonLoading(button, true);
        try {
            await api.deleteIngredient(ingredientId);
            console.log(`Successfully deleted ingredient: ${ingredientName}`);
            // Reload ingredients to reflect the change
            await loadIngredients();
        } catch (error) {
            console.error(`Error deleting ingredient ${ingredientName}:`, error);
            ui.displayErrorToast(error.message || 'Kon ingrediënt niet verwijderen.');
            ui.setButtonLoading(button, false); // Only reset loading on error, row removal handles success
        }
        // No need to manually reset loading state here if row is removed on success
    }, () => {
        console.log(`Cancelled deletion for ingredient: ${ingredientName}`);
        // Optional: Add any logic needed on cancellation
    });
}

// --- Initialization ---

// Use event delegation for delete buttons within the table body
function handleIngredientTableClicks(event) {
    if (event.target.classList.contains('delete-ingredient-btn')) {
        handleDeleteIngredient(event);
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

    // Remove the call to the non-existent fetchAppConfig
    // fetchAppConfig();
    // Config is now loaded on demand via ensureConfigLoaded()

    console.log("Ingredient View setup complete.");
}
