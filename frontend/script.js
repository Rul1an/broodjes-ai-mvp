document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const ideaInput = document.getElementById('broodje-idee');
    const recipeOutput = document.getElementById('recept-output');
    const loadingIndicator = document.getElementById('loading');
    const loadingListIndicator = document.getElementById('loading-list');
    const recipeList = document.getElementById('recepten-lijst');

    // --- New Ingredient Management Elements ---
    const ingredientNameInput = document.getElementById('ingredient-name');
    const ingredientUnitInput = document.getElementById('ingredient-unit');
    const ingredientPriceInput = document.getElementById('ingredient-price');
    const addIngredientBtn = document.getElementById('add-ingredient-btn');
    const ingredientFeedback = document.getElementById('ingredient-feedback');
    const loadingIngredientsIndicator = document.getElementById('loading-ingredients');
    const ingredientTableBody = document.querySelector('#ingredienten-tabel tbody');
    const clearRecipesBtn = document.getElementById('clear-recipes-btn');
    const navigationButtons = document.querySelectorAll('.nav-button');
    const views = document.querySelectorAll('.view');
    const modelSelect = document.getElementById('model-select');

    // API Endpoints
    const generateRecipeGCFUrl = 'https://europe-west1-broodjes-ai.cloudfunctions.net/generateRecipe';
    const getRecipesApiUrl = '/api/getRecipes';
    const getIngredientsApiUrl = '/api/getIngredients';
    const addIngredientApiUrl = '/api/addIngredient';
    const updateIngredientApiUrl = '/api/updateIngredient';
    const deleteIngredientApiUrl = '/api/deleteIngredient';
    const refineRecipeApiUrl = '/api/refineRecipe';
    const clearRecipesApiUrl = '/api/clearRecipes';

    // --- View Switching Logic ---
    const setActiveView = (viewId) => {
        views.forEach(view => {
            if (view.id === viewId) {
                view.classList.add('active-view');
            } else {
                view.classList.remove('active-view');
            }
        });
        navigationButtons.forEach(button => {
            if (button.dataset.view === viewId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        if (viewId === 'view-recipes') loadRecipes();
        if (viewId === 'view-ingredients') loadIngredients();
    };

    navigationButtons.forEach(button => {
        button.addEventListener('click', () => {
            setActiveView(button.dataset.view);
        });
    });

    // --- Function to clear all recipes ---
    const handleClearAllRecipes = async () => {
        if (!confirm('WAARSCHUWING: Weet je zeker dat je ALLE opgeslagen recepten permanent wilt verwijderen?')) {
            return;
        }

        const originalButtonText = clearRecipesBtn.textContent;
        clearRecipesBtn.disabled = true;
        clearRecipesBtn.textContent = 'Verwijderen...';
        loadingListIndicator.style.display = 'block';

        try {
            const response = await fetch(clearRecipesApiUrl, { method: 'POST' });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            alert('Alle recepten zijn succesvol verwijderd.');
            loadRecipes(); // Reload the (now empty) list

        } catch (error) {
            console.error('Error clearing recipes:', error);
            alert(`Kon recepten niet verwijderen: ${error.message}`);
        } finally {
            clearRecipesBtn.disabled = false;
            clearRecipesBtn.textContent = originalButtonText;
            loadingListIndicator.style.display = 'none';
        }
    };

    // Function to fetch and display recipes
    const loadRecipes = async () => {
        loadingListIndicator.style.display = 'block';
        recipeList.innerHTML = ''; // Clear existing list

        try {
            const response = await fetch(getRecipesApiUrl);
            if (!response.ok) {
                let errorMsg = `Fout bij ophalen: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { }
                throw new Error(errorMsg);
            }
            const data = await response.json();

            if (data.recipes && data.recipes.length > 0) {
                data.recipes.forEach(recipe => {
                    const listItem = document.createElement('li');
                    listItem.dataset.recipeId = recipe.id;
                    listItem.dataset.recipeText = recipe.generated_recipe;

                    let displayTitle = recipe.idea || 'Onbekend Recept'; // Fallback title
                    let generatedRecipeJson = null;
                    let parseError = false;

                    // Try to parse the generated recipe JSON to get the title
                    if (recipe.generated_recipe) {
                        try {
                            generatedRecipeJson = JSON.parse(recipe.generated_recipe);
                            if (generatedRecipeJson && typeof generatedRecipeJson.title === 'string' && generatedRecipeJson.title.trim() !== '') {
                                displayTitle = generatedRecipeJson.title;
                            } else {
                                console.warn(`Recipe ID ${recipe.id}: Parsed JSON missing valid title.`);
                            }
                        } catch (e) {
                            console.error(`Recipe ID ${recipe.id}: Failed to parse generated_recipe JSON:`, e);
                            console.error("Invalid JSON string:", recipe.generated_recipe);
                            parseError = true; // Flag if parsing failed
                        }
                    } else {
                        console.warn(`Recipe ID ${recipe.id}: Missing generated_recipe data.`);
                    }

                    let estimatedCostHtml = '';
                    if (recipe.estimated_total_cost !== null && recipe.estimated_total_cost !== undefined) {
                        // Format as currency (e.g., €1.50)
                        const cost = parseFloat(recipe.estimated_total_cost);
                        estimatedCostHtml = `<br><small>Geschatte Kosten: €${isNaN(cost) ? 'N/A' : cost.toFixed(2)}</small>`;
                    }

                    const recipeDetailsHtml = parseError
                        ? `<pre class="original-recipe-text" style="color: red;">Kon recept niet lezen (ongeldig formaat).</pre><pre>${recipe.generated_recipe || 'Geen data'}</pre>`
                        : `<pre class="original-recipe-text">${formatRecipeJsonToText(generatedRecipeJson) || 'Kon recept niet formatteren.'}</pre>`;

                    listItem.innerHTML = `
                        <b>${displayTitle}</b>
                        <br>
                        <small>Opgeslagen op: ${new Date(recipe.created_at).toLocaleString('nl-NL')}</small>
                        ${estimatedCostHtml}
                        <details>
                            <summary>Bekijk/Verfijn Recept</summary>
                            ${recipeDetailsHtml}
                            <div class="refine-section" style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;">
                                <input type="text" class="refine-input" placeholder="Vraag om verfijning (bv. maak het pittiger)" style="width: 70%; margin-right: 5px;">
                                <button class="refine-btn">Verfijn Recept</button>
                                <div class="refine-loading" style="display: none; font-style: italic; color: #888;">Verfijnen...</div>
                                <pre class="refined-recipe-output" style="margin-top: 5px; background-color: #eef;"></pre>
                            </div>
                        </details>
                        <button class="calculate-actual-cost-btn" style="margin-left: 10px;" disabled title="Bereken werkelijke kosten (nog niet geïmplementeerd)">Bereken Kosten</button>
                    `;
                    recipeList.appendChild(listItem);
                });
            } else {
                recipeList.innerHTML = '<li>Nog geen recepten opgeslagen.</li>';
            }

        } catch (error) {
            console.error('Error fetching recipes:', error);
            recipeList.innerHTML = `<li>Kon recepten niet laden: ${error.message}</li>`;
        } finally {
            loadingListIndicator.style.display = 'none';
        }
    };

    // --- Functions for Ingredient Management ---
    const loadIngredients = async () => {
        loadingIngredientsIndicator.style.display = 'block';
        ingredientTableBody.innerHTML = ''; // Clear existing table body

        try {
            const response = await fetch(getIngredientsApiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.ingredients && data.ingredients.length > 0) {
                data.ingredients.forEach(ingredient => {
                    const row = ingredientTableBody.insertRow();
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
        } catch (error) {
            console.error('Error fetching ingredients:', error);
            const row = ingredientTableBody.insertRow();
            row.innerHTML = `<td colspan="4">Kon ingrediënten niet laden: ${error.message}</td>`;
        } finally {
            loadingIngredientsIndicator.style.display = 'none';
        }
    };

    const handleAddIngredient = async () => {
        const name = ingredientNameInput.value.trim();
        const unit = ingredientUnitInput.value.trim();
        const price = ingredientPriceInput.value;

        if (!name || !unit || price === '') {
            alert('Vul alle velden in voor het ingrediënt.');
            return;
        }

        const originalButtonText = addIngredientBtn.textContent;
        addIngredientBtn.disabled = true;
        addIngredientBtn.textContent = 'Toevoegen...';
        ingredientFeedback.style.display = 'none';

        try {
            const response = await fetch(addIngredientApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, unit, price_per_unit: price })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            ingredientFeedback.textContent = `Ingrediënt '${data.ingredient.name}' succesvol toegevoegd!`;
            ingredientFeedback.style.color = 'green';
            ingredientFeedback.style.display = 'block';

            // Clear form
            ingredientNameInput.value = '';
            ingredientUnitInput.value = '';
            ingredientPriceInput.value = '';

            loadIngredients(); // Refresh the list

        } catch (error) {
            console.error('Error adding ingredient:', error);
            ingredientFeedback.textContent = `Fout: ${error.message}`;
            ingredientFeedback.style.color = 'red';
            ingredientFeedback.style.display = 'block';
        } finally {
            addIngredientBtn.disabled = false;
            addIngredientBtn.textContent = originalButtonText;
        }
    };

    const handleDeleteIngredient = async (ingredientId, button) => {
        if (!confirm('Weet je zeker dat je dit ingrediënt wilt verwijderen?')) {
            return;
        }

        const originalButtonText = button.textContent;
        button.disabled = true;
        button.textContent = '...'; // Keep it short for table buttons

        try {
            const response = await fetch(`${deleteIngredientApiUrl}?id=${ingredientId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // Remove the row from the table
            const row = button.closest('tr');
            if (row) {
                row.remove();
            } else {
                loadIngredients(); // Fallback to reload if row finding fails
            }

        } catch (error) {
            console.error('Error deleting ingredient:', error);
            alert(`Fout bij verwijderen: ${error.message}`);
            // Re-enable button even on error
            button.disabled = false;
            button.textContent = originalButtonText;
        }
        // Button is removed with row on success, no finally needed for re-enabling
    };

    ingredientTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-ingredient-btn')) {
            const ingredientId = event.target.dataset.id;
            handleDeleteIngredient(ingredientId, event.target);
        }
    });

    // --- Function to Refine Recipe (Keep existing, but might need update later) ---
    const handleRefineRecipe = async (button) => {
        const listItem = button.closest('li');
        const recipeId = listItem.dataset.recipeId;
        const originalRecipeText = listItem.dataset.recipeText;
        const refineInput = listItem.querySelector('.refine-input');
        const refineLoading = listItem.querySelector('.refine-loading');
        const refinedOutput = listItem.querySelector('.refined-recipe-output');
        const refinePrompt = refineInput.value.trim();

        if (!refinePrompt) {
            alert('Voer een verfijningsprompt in.');
            return;
        }

        refineLoading.style.display = 'block';
        refinedOutput.textContent = '';
        button.disabled = true;
        refineInput.disabled = true;

        try {
            const response = await fetch(refineRecipeApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId, refinementRequest: refinePrompt, originalRecipe: originalRecipeText })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            refinedOutput.textContent = data.refinedRecipe;

        } catch (error) {
            console.error('Error refining recipe:', error);
            refinedOutput.textContent = `Fout bij verfijnen: ${error.message}`;
        } finally {
            refineLoading.style.display = 'none';
            button.disabled = false;
            refineInput.disabled = false;
        }
    };

    recipeList.addEventListener('click', (event) => {
        if (event.target.classList.contains('refine-btn')) {
            handleRefineRecipe(event.target);
        }
        // Add listener for calculate-actual-cost-btn if needed
    });

    // --- Function to Display Generated/Fetched Recipe in the Main Output Area ---
    const displayRecipe = (recipe) => {
        if (!recipe || typeof recipe !== 'object') {
            recipeOutput.innerHTML = '<p>Fout: Ongeldige receptdata ontvangen.</p>';
            return;
        }

        let html = `<h2>${recipe.title || 'Onbekend Recept'}</h2>`;
        html += `<p>${recipe.description || ''}</p>`;

        if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
            html += '<h3>Ingrediënten:</h3><ul>';
            recipe.ingredients.forEach(ing => {
                html += `<li>${ing.quantity || ''} ${ing.name || 'Onbekend ingrediënt'}</li>`;
            });
            html += '</ul>';
        }

        if (recipe.instructions && Array.isArray(recipe.instructions)) {
            html += '<h3>Instructies:</h3><ol>';
            recipe.instructions.forEach(inst => {
                html += `<li>${inst}</li>`;
            });
            html += '</ol>';
        }
        // You can add more fields here if the GCF returns them

        recipeOutput.innerHTML = html;
    };

    // --- Function to Handle Recipe Generation ---
    const handleGenerateRecipe = async () => {
        const idea = ideaInput.value.trim();
        const model = modelSelect.value; // Get selected model

        if (!idea) {
            alert('Vul een broodje-idee in!');
            return;
        }

        generateBtn.disabled = true;
        loadingIndicator.style.display = 'block';
        recipeOutput.innerHTML = ''; // Clear previous output
        console.log(`Generating recipe for: ${idea} using model ${model}`); // Log model usage

        try {
            console.log('Sending request to GCF:', generateRecipeGCFUrl);
            const response = await fetch(generateRecipeGCFUrl, { // <<< USE GCF URL
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ingredients: idea, type: 'broodje', language: 'Nederlands', model: model }) // Send idea as 'ingredients' and type 'broodje', include model
            });

            console.log('Received response from GCF, status:', response.status);

            if (!response.ok) {
                let errorMsg = `Genereren mislukt (status ${response.status})`;
                try {
                    const errorData = await response.json();
                    console.error('GCF Error Response:', errorData);
                    errorMsg = errorData.details || errorData.error || errorMsg;
                } catch (e) {
                    console.error('Failed to parse error response:', await response.text());
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log('GCF Success Response:', data);

            if (data.recipe) {
                displayRecipe(data.recipe); // <<< Call display function directly
            } else {
                throw new Error('Geldig antwoord ontvangen, maar geen recept gevonden.');
            }

        } catch (error) {
            console.error('Error during recipe generation:', error);
            recipeOutput.innerHTML = `<p style="color: red;"><strong>Fout:</strong> ${error.message}</p>`;
        } finally {
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
        }
    };

    // Event Listeners
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateRecipe);
    }
    if (addIngredientBtn) {
        addIngredientBtn.addEventListener('click', handleAddIngredient);
    }
    if (clearRecipesBtn) {
        clearRecipesBtn.addEventListener('click', handleClearAllRecipes);
    }

    // Initial Load / Setup
    setActiveView('view-generator'); // Start on the generator view
    // Load ingredients in the background? Or handled by view switch
});

// --- Helper Function to Format JSON Recipe to Text ---
function formatRecipeJsonToText(recipeJson) {
    if (!recipeJson || typeof recipeJson !== 'object') {
        return "Kon recept niet formatteren (ongeldige data).";
    }

    let text = ``;
    if (recipeJson.title) {
        text += `# ${recipeJson.title}\n\n`;
    }
    if (recipeJson.description) {
        text += `${recipeJson.description}\n\n`;
    }

    if (recipeJson.ingredients && Array.isArray(recipeJson.ingredients) && recipeJson.ingredients.length > 0) {
        text += `## Ingrediënten:\n`;
        recipeJson.ingredients.forEach(ing => {
            text += `- ${ing.quantity || ''} ${ing.name || 'Onbekend'}\n`;
        });
        text += `\n`;
    }

    if (recipeJson.instructions && Array.isArray(recipeJson.instructions) && recipeJson.instructions.length > 0) {
        text += `## Instructies:\n`;
        recipeJson.instructions.forEach((inst, index) => {
            text += `${index + 1}. ${inst}\n`;
        });
        text += `\n`;
    }

    // Add other fields if they exist in the JSON and you want to display them
    // e.g., preparation time, cost (though cost is usually displayed separately)

    return text.trim(); // Return the formatted text
}
