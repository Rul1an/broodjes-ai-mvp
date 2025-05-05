import * as api from '../apiService.js';
import * as ui from '../uiUtils.js';

// GCF Trigger URL
let gcfTriggerUrl = null;

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
    if (!gcfTriggerUrl) {
        console.error("GCF Trigger URL not available.");
        // Optionally display a user-facing error or retry fetching the config
        return;
    }

    console.log(`Triggering GCF for ingredient: ${ingredientName} (ID: ${ingredientId})`);
    try {
        const response = await fetch(gcfTriggerUrl, {
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
            // Log the error but don't necessarily block the user
            console.error(`GCF trigger failed with status ${response.status}:`, await response.text());
            ui.displayErrorToast(`Beeldgeneratie trigger mislukt (status ${response.status}).`);
        } else {
            console.log("GCF triggered successfully.");
            // Optional: display a success message, maybe a subtle one
            // ui.displayInfoToast(`Beeldgeneratie gestart voor ${ingredientName}.`);
        }
    } catch (error) {
        console.error("Error triggering GCF:", error);
        ui.displayErrorToast('Fout bij het triggeren van beeldgeneratie.');
    }
};

// Function to fetch application configuration (including GCF URL)
const fetchAppConfig = async () => {
    console.log("Fetching application config...");
    try {
        const config = await api.getConfig();
        if (config && config.gcfImageUrl) {
            gcfTriggerUrl = config.gcfImageUrl;
            console.log("GCF Trigger URL fetched:", gcfTriggerUrl);
        } else {
            console.error("GCF Trigger URL not found in config response:", config);
            ui.displayErrorToast('Kon configuratie voor beeldgeneratie niet laden.');
        }
    } catch (error) {
        console.error("Error fetching app config:", error);
        ui.displayErrorToast('Fout bij laden applicatieconfiguratie.');
        // Consider how to handle this - maybe retry?
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

    // Fetch the config when the view is set up
    fetchAppConfig();

    console.log("Ingredient View setup complete.");
    // Note: loadIngredients() is called by the navigation module when the view becomes active.
}
