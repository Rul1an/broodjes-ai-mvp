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

    // API Endpoints
    const generateApiUrl = '/api/generate';
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

        clearRecipesBtn.disabled = true;
        loadingListIndicator.style.display = 'block';

        try {
            const response = await fetch(clearRecipesApiUrl, { method: 'POST' });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            alert('Alle recepten zijn succesvol verwijderd.');
            loadRecipes();

        } catch (error) {
            console.error('Error clearing recipes:', error);
            alert(`Kon recepten niet verwijderen: ${error.message}`);
        } finally {
            clearRecipesBtn.disabled = false;
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
                addRefineButtonListeners();
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
                // Add event listeners to delete buttons AFTER they are in the DOM
                addDeleteButtonListeners();
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

        addIngredientBtn.disabled = true;
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
        }
    };

    const handleDeleteIngredient = async (ingredientId) => {
        if (!confirm('Weet je zeker dat je dit ingrediënt wilt verwijderen?')) {
            return;
        }

        try {
            // Note: ID is passed as query parameter for DELETE
            const response = await fetch(`${deleteIngredientApiUrl}?id=${ingredientId}`, {
                method: 'DELETE'
            });

            if (!response.ok && response.status !== 204) { // 204 No Content is success for DELETE
                const errorData = await response.json().catch(() => ({})); // Try to parse error, ignore if no body
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // alert('Ingrediënt succesvol verwijderd!'); // Optional feedback
            loadIngredients(); // Refresh the list

        } catch (error) {
            console.error('Error deleting ingredient:', error);
            alert(`Kon ingrediënt niet verwijderen: ${error.message}`);
        }
    };

    // Function to add listeners to dynamically created delete buttons
    const addDeleteButtonListeners = () => {
        document.querySelectorAll('.delete-ingredient-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const ingredientId = event.target.getAttribute('data-id');
                handleDeleteIngredient(ingredientId);
            });
        });
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

        button.disabled = true;
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
            outputPre.textContent = data.recipe;
            // Optionally display the new estimated cost if needed
            // if (data.estimated_cost) { ... }

        } catch (error) {
            console.error('Error refining recipe:', error);
            outputPre.textContent = `Fout bij verfijnen: ${error.message}`;
        } finally {
            button.disabled = false;
            loadingDiv.style.display = 'none';
        }
    };

    // Function to add listeners to dynamically created refine buttons
    const addRefineButtonListeners = () => {
        document.querySelectorAll('.refine-btn').forEach(button => {
            // Clean up potential old listeners before adding new ones
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            newButton.addEventListener('click', () => {
                handleRefineRecipe(newButton);
            });
        });
    };

    // Generate button event listener
    generateBtn.addEventListener('click', async () => {
        const idea = ideaInput.value.trim();
        if (!idea) {
            alert('Voer alsjeblieft een broodjesidee in.');
            return;
        }

        recipeOutput.textContent = '';
        estimatedCostOutput.textContent = '';
        loadingIndicator.style.display = 'block';
        generateBtn.disabled = true;

        try {
            const response = await fetch(generateApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idea: idea })
            });

            if (!response.ok) {
                let errorMsg = `Fout: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            recipeOutput.textContent = data.recipe;

            // --- Display Estimated Cost ---
            if (data.estimated_cost !== null && data.estimated_cost !== undefined) {
                estimatedCostOutput.textContent = `Geschatte Totale Kosten (AI): €${data.estimated_cost.toFixed(2)}`;
            } else {
                estimatedCostOutput.textContent = 'Kon geen kosten schatten.';
            }
            // ---------------------------

            loadRecipes();

        } catch (error) {
            console.error('Error generating recipe:', error);
            recipeOutput.textContent = `Kon het recept niet genereren: ${error.message}`;
            estimatedCostOutput.textContent = '';
        } finally {
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
        }
    });

    // Optional: Allow pressing Enter
    ideaInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            generateBtn.click();
        }
    });

    // New listener for adding ingredient
    addIngredientBtn.addEventListener('click', handleAddIngredient);
    clearRecipesBtn.addEventListener('click', handleClearAllRecipes);

    // --- Initial Setup ---
    setActiveView('view-generate');
    // Data for other views will be loaded when they are switched to.
});
