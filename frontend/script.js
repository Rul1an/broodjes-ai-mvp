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
    const generateStartApiUrl = '/api/generate-start';
    const getProcessedRecipeApiUrl = '/api/get-processed-recipe';
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
    const MAX_POLL_ATTEMPTS = 40; // Stop polling after 120 seconds (40 * 3s)

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

    // --- NEW POLLING FUNCTION ---
    const pollRecipeStatus = async (taskId, attempts = 0) => {
        console.log(`Polling attempt ${attempts + 1} for task ${taskId}`);

        if (attempts >= MAX_POLL_ATTEMPTS) {
            console.error(`Max poll attempts reached for task ${taskId}.`);
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            loadingIndicator.style.display = 'none';
            recipeOutput.innerHTML = '<p class="error">Het duurde te lang om het recept op te halen. Probeer het opnieuw.</p>';
            generateBtn.disabled = false;
            return;
        }

        try {
            const response = await fetch(`${getProcessedRecipeApiUrl}?task_id=${taskId}`);

            if (!response.ok) {
                // Handle specific errors like 404 (task not found yet?)
                if (response.status === 404) {
                    console.warn(`Task ${taskId} not found yet (404), continuing poll.`);
                    // No error message shown yet, just continue polling
                    return;
                }
                // Other HTTP errors
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP Fout: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'pending' || data.status === 'processing') {
                // Task is still running, wait for the next poll
                recipeOutput.innerHTML = `<p>Status: ${data.status}... Het recept wordt gegenereerd.</p>`;
                // Keep polling
            } else if (data.status === 'failed') {
                console.error(`Task ${taskId} failed:`, data.error);
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
                loadingIndicator.style.display = 'none';
                recipeOutput.innerHTML = `<p class="error">Recept genereren mislukt: ${data.error || 'Onbekende fout'}</p>`;
                generateBtn.disabled = false;
            } else if (data.status === 'completed') {
                console.log(`Task ${taskId} completed!`);
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
                loadingIndicator.style.display = 'none';

                // Generate Markdown from the processed recipe data
                const recipe = data.recipe;
                let markdown = `## ${recipe.naam || 'Naamloos Broodje'}\n\n`;
                if (recipe.beschrijving) {
                    markdown += `${recipe.beschrijving}\n\n`;
                }
                markdown += `### Ingrediënten\n`;
                recipe.ingredienten.forEach(ing => {
                    markdown += `- ${ing.naam}: ${ing.hoeveelheid}`;
                    if (ing.cost && ing.cost !== 'N/A') {
                        markdown += ` (kosten: €${ing.cost})`;
                    }
                    if (ing.unit && ing.cost === 'N/A') { // Show unit if cost is N/A
                        markdown += ` (${ing.unit})`;
                    } else if (ing.unit) { // Show unit if cost is present
                        markdown += ` per ${ing.unit}`;
                    }
                    markdown += '\n';
                });
                if (recipe.totalCost) {
                    markdown += `\n**Geschatte Totale Kosten:** €${recipe.totalCost}\n`;
                }
                markdown += `\n### Instructies\n`;
                recipe.instructies.forEach((stap, index) => {
                    markdown += `${index + 1}. ${stap}\n`;
                });

                recipeOutput.innerHTML = marked.parse(markdown);
                generateBtn.disabled = false;
            } else {
                // Unknown status - should not happen with current backend logic
                console.warn(`Unknown status received for task ${taskId}:`, data.status);
                // Continue polling for a bit? Or stop?
                // Let's stop for now to avoid infinite loops on weird states
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
                loadingIndicator.style.display = 'none';
                recipeOutput.innerHTML = `<p class="error">Onbekende status (${data.status}) ontvangen. Probeer het opnieuw.</p>`;
                generateBtn.disabled = false;
            }

        } catch (error) {
            console.error('Error during polling:', error);
            // Don't stop polling on network errors immediately, could be temporary
            // Maybe add a counter for consecutive network errors?
            // For now, just log it and let the max attempts handle it.
            recipeOutput.innerHTML = `<p class="error">Fout bij controleren status: ${error.message}. Poging ${attempts + 1}/${MAX_POLL_ATTEMPTS}</p>`;
            // Consider stopping polling if error persists
            /*
            if (error might be permanent) {
                 clearInterval(pollingIntervalId);
                 pollingIntervalId = null;
                 loadingIndicator.style.display = 'none';
                 generateBtn.disabled = false;
            }
            */
        }
    };

    // --- MODIFIED handleGenerateRecipe function ---
    const handleGenerateRecipe = async () => {
        const idea = ideaInput.value.trim();
        const selectedModel = modelSelect.value;

        if (!idea) {
            alert('Voer een idee voor je broodje in!');
            return;
        }

        // Stop any previous polling
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }

        loadingIndicator.style.display = 'block';
        recipeOutput.innerHTML = ''; // Clear previous output
        generateBtn.disabled = true;

        try {
            console.log(`Sending request to ${generateStartApiUrl} with idea: ${idea}, model: ${selectedModel}`);
            const response = await fetch(generateStartApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idea: idea, model: selectedModel })
            });

            if (!response.ok) {
                let errorMsg = `Starten mislukt: HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = `Starten mislukt: ${errorData.error || response.statusText}`;
                } catch (e) { /* Ignore parsing error if body isn't JSON */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.task_id) {
                console.log(`Task started with ID: ${data.task_id}. Starting polling.`);
                recipeOutput.innerHTML = '<p>Taak gestart... Recept wordt opgehaald.</p>';
                // Start polling
                let attempts = 0;
                // Initial immediate check
                await pollRecipeStatus(data.task_id, attempts++);
                // Set interval only if not already completed/failed on first check
                if (pollingIntervalId === null) { // Check if pollRecipeStatus didn't clear the interval
                    pollingIntervalId = setInterval(() => {
                        pollRecipeStatus(data.task_id, attempts++);
                    }, POLLING_INTERVAL_MS);
                }
            } else {
                // Should not happen if backend returns 202 correctly
                throw new Error('Geen task_id ontvangen van de server.');
            }

        } catch (error) {
            console.error('Error starting recipe generation:', error);
            recipeOutput.innerHTML = `<p class="error">${error.message}</p>`;
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
            // Ensure polling stops on start error
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
            }
        }
        // Note: Loading indicator and button re-enable are now handled by the polling function
    };

    // --- Event Listeners ---
    generateBtn.addEventListener('click', handleGenerateRecipe);
    addIngredientBtn.addEventListener('click', handleAddIngredient);
    clearRecipesBtn?.addEventListener('click', handleClearAllRecipes); // Optional chaining if button might not exist

    // Delegate event listeners for dynamically added buttons (Delete Ingredient)
    ingredientTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-ingredient-btn')) {
            handleDeleteIngredient(event.target.dataset.id, event.target);
        }
    });

    // Delegate event listeners for dynamically added buttons (Refine Recipe) - KEEP IF NEEDED
    // recipeList.addEventListener('click', (event) => { ... });

    // --- Initial Load ---
    setActiveView('view-generator'); // Start on the generator view
    // Load ingredients in the background maybe? Or wait until view switch?
    // loadIngredients();
});
