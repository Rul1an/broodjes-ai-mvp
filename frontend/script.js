document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const ideaInput = document.getElementById('broodje-idee');
    const recipeOutput = document.getElementById('recept-output');
    const estimatedCostOutput = document.getElementById('estimated-cost-output');
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
    const generateStartApiUrl = '/api/generate-start';
    const generateStatusApiUrl = '/api/generate-status/';
    const getRecipesApiUrl = '/api/getRecipes';
    const getIngredientsApiUrl = '/api/getIngredients';
    const addIngredientApiUrl = '/api/addIngredient';
    const updateIngredientApiUrl = '/api/updateIngredient';
    const deleteIngredientApiUrl = '/api/deleteIngredient';
    const refineRecipeApiUrl = '/api/refineRecipe';
    const clearRecipesApiUrl = '/api/clearRecipes';

    // Variable to hold the polling interval ID
    let pollingIntervalId = null;
    const POLLING_INTERVAL_MS = 3000; // Check status every 3 seconds
    const MAX_POLL_ATTEMPTS = 20; // Stop polling after 60 seconds (20 * 3s)

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

                    let estimatedCostHtml = '';
                    if (recipe.estimated_total_cost !== null && recipe.estimated_total_cost !== undefined) {
                        estimatedCostHtml = `<br><small>Geschatte Kosten: €${recipe.estimated_total_cost.toFixed(2)}</small>`;
                    }

                    listItem.innerHTML = `
                        <b>${recipe.idea || 'Onbekend Idee'}</b>
                        <br>
                        <small>Opgeslagen op: ${new Date(recipe.created_at).toLocaleString()}</small>
                        ${estimatedCostHtml}
                        <details>
                            <summary>Bekijk/Verfijn Recept</summary>
                            <pre class="original-recipe-text">${recipe.generated_recipe || 'Geen recept data'}</pre>
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

            if (!response.ok && response.status !== 204) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // alert('Ingrediënt succesvol verwijderd!'); // Optional feedback
            loadIngredients(); // Refresh the list

        } catch (error) {
            console.error('Error deleting ingredient:', error);
            alert(`Kon ingrediënt niet verwijderen: ${error.message}`);
            // Restore text also on error
            button.disabled = false;
            button.textContent = originalButtonText;
        }
        // Note: No finally block needed here as loadIngredients() redraws the table
        // If the delete failed, the button is restored in the catch block.
        // If successful, the button disappears anyway when the list reloads.
    };

    // --- Function for Recipe Refinement ---
    const handleRefineRecipe = async (button) => {
        const listItem = button.closest('li');
        const originalRecipeText = listItem.dataset.recipeText;
        const refineInput = listItem.querySelector('.refine-input');
        const refineRequest = refineInput.value.trim();
        const loadingDiv = listItem.querySelector('.refine-loading');
        const outputPre = listItem.querySelector('.refined-recipe-output');

        if (!refineRequest) {
            alert('Voer een verfijningsverzoek in.');
            return;
        }

        const originalButtonText = button.textContent;
        button.disabled = true;
        button.textContent = 'Verfijnen...';
        loadingDiv.style.display = 'block';
        outputPre.textContent = '';

        try {
            const response = await fetch(refineRecipeApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ originalRecipe: originalRecipeText, refinementRequest: refineRequest })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            // Update the output with Markdown rendering
            if (typeof marked !== 'undefined') {
                outputPre.innerHTML = marked.parse(data.recipe || '');
            } else {
                console.error("Marked library not found for refining output.");
                outputPre.textContent = data.recipe; // Fallback to text
            }
            // Optionally display the new estimated cost if needed
            // if (data.estimated_cost) { ... }

        } catch (error) {
            console.error('Error refining recipe:', error);
            outputPre.textContent = `Fout bij verfijnen: ${error.message}`;
        } finally {
            button.disabled = false;
            button.textContent = originalButtonText;
            loadingDiv.style.display = 'none';
        }
    };

    // --- New Polling Function for Asynchronous Generation ---
    const pollTaskStatus = async (taskId, pollCount = 0) => {
        console.log(`Polling task ${taskId}, attempt ${pollCount + 1}`);

        if (pollCount >= MAX_POLL_ATTEMPTS) {
            console.error(`Polling stopped for task ${taskId} after reaching max attempts.`);
            recipeOutput.textContent = 'Fout: Recept genereren duurde te lang.';
            estimatedCostOutput.textContent = '';
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            return;
        }

        try {
            const response = await fetch(generateStatusApiUrl + taskId);

            // Handle cases where the task is not found (maybe backend restarted)
            if (response.status === 404) {
                console.error(`Task ${taskId} not found.`);
                recipeOutput.textContent = 'Fout: Generatie taak niet gevonden. Probeer opnieuw.';
                estimatedCostOutput.textContent = '';
                loadingIndicator.style.display = 'none';
                generateBtn.disabled = false;
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
                return;
            }

            if (!response.ok) {
                // Handle other potential server errors during status check
                throw new Error(`Status check failed: HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'completed') {
                console.log(`Task ${taskId} completed successfully.`);
                recipeOutput.textContent = data.recipe || 'Geen recept ontvangen.';
                if (data.estimated_cost !== null && data.estimated_cost !== undefined) {
                    estimatedCostOutput.textContent = `Geschatte kosten: €${data.estimated_cost.toFixed(2)}`;
                } else {
                    estimatedCostOutput.textContent = ''; // Clear cost if not available
                }
                loadingIndicator.style.display = 'none';
                generateBtn.disabled = false;
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;

                // Optionally reload recipe list if needed
                if (document.getElementById('view-recipes').classList.contains('active-view')) {
                    loadRecipes();
                }

            } else if (data.status === 'failed') {
                console.error(`Task ${taskId} failed:`, data.error);
                recipeOutput.textContent = `Fout bij genereren: ${data.error || 'Onbekende fout'}`;
                estimatedCostOutput.textContent = '';
                loadingIndicator.style.display = 'none';
                generateBtn.disabled = false;
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
            } else if (data.status === 'pending') {
                // Still pending, continue polling
                // Optionally update the loading indicator text here
                loadingIndicator.textContent = `Genereren... (${pollCount + 1}/${MAX_POLL_ATTEMPTS})`;
            } else {
                // Unexpected status
                console.error(`Task ${taskId} has unexpected status:`, data.status);
                recipeOutput.textContent = `Fout: Onverwachte status (${data.status}).`;
                estimatedCostOutput.textContent = '';
                loadingIndicator.style.display = 'none';
                generateBtn.disabled = false;
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
            }

        } catch (error) {
            console.error('Error polling task status:', error);
            recipeOutput.textContent = `Fout bij controleren status: ${error.message}`;
            estimatedCostOutput.textContent = '';
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
    };

    // --- Modified Recipe Generation Logic (Asynchronous) ---
    const handleGenerateRecipe = async () => {
        const idea = ideaInput.value.trim();
        const selectedModel = modelSelect.value;
        if (!idea) {
            alert('Vul een broodje-idee in!');
            return;
        }

        // Clear previous polling interval if any
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }

        // Update UI for starting generation
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Starten...'; // Initial message
        recipeOutput.textContent = '';
        estimatedCostOutput.textContent = '';
        generateBtn.disabled = true;

        try {
            // Call the new start endpoint
            const response = await fetch(generateStartApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idea: idea, model: selectedModel })
            });

            // Handle immediate errors from starting the task
            if (!response.ok) {
                // 202 Accepted is also OK here, but we handle specific errors
                if (response.status === 202) {
                    // This is the expected success case for starting
                } else {
                    const errorData = await response.json().catch(() => ({})); // Try parsing error
                    throw new Error(errorData.error || `Starten mislukt: HTTP error! status: ${response.status}`);
                }
            }

            const data = await response.json();
            const taskId = data.task_id;

            if (!taskId) {
                throw new Error('Geen taak ID ontvangen van de server.');
            }

            console.log(`Task ${taskId} started. Starting polling.`);
            loadingIndicator.textContent = 'Genereren... (0/' + MAX_POLL_ATTEMPTS + ')'; // Update loading message

            // Start polling
            let currentPollCount = 0;
            pollingIntervalId = setInterval(() => {
                pollTaskStatus(taskId, currentPollCount++);
            }, POLLING_INTERVAL_MS);

            // Initial immediate check (optional, reduces perceived delay)
            // pollTaskStatus(taskId, currentPollCount++);

        } catch (error) {
            console.error('Error starting recipe generation:', error);
            recipeOutput.textContent = `Fout bij starten: ${error.message}`;
            estimatedCostOutput.textContent = '';
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
            // Ensure polling interval is cleared on start error
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
            }
        }
    };

    // --- Event Listeners ---
    generateBtn.addEventListener('click', handleGenerateRecipe);
    addIngredientBtn.addEventListener('click', handleAddIngredient);
    clearRecipesBtn.addEventListener('click', handleClearAllRecipes);

    // === NEW: Event Delegation Listeners ===
    // Listener for clicks within the recipe list (handles refine buttons)
    recipeList.addEventListener('click', (event) => {
        const refineButton = event.target.closest('.refine-btn');
        if (refineButton) {
            console.log("Refine button clicked (delegated)");
            handleRefineRecipe(refineButton); // Pass the button element
        }
        // Can add more checks here for other buttons within list items if needed
    });

    // Listener for clicks within the ingredient table body (handles delete buttons)
    ingredientTableBody.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-ingredient-btn');
        if (deleteButton) {
            console.log("Delete ingredient button clicked (delegated)");
            const ingredientId = deleteButton.getAttribute('data-id');
            if (ingredientId) {
                handleDeleteIngredient(ingredientId, deleteButton); // Pass ID and button
            } else {
                console.error("Delete button clicked but no data-id found.");
            }
        }
        // Can add more checks here for other buttons within table rows if needed
    });
    // ======================================

    // --- Initial Setup ---
    setActiveView('view-generator');
    // Data for other views will be loaded when they are switched to.
});
