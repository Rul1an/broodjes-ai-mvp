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
    const getCostBreakdownApiUrl = '/api/getCostBreakdown';

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
                    let recipeDetailsHtml = ''; // Initialize details HTML

                    // Try to parse the generated recipe JSON to get the title
                    if (recipe.generated_recipe && typeof recipe.generated_recipe === 'string') {
                        try {
                            generatedRecipeJson = JSON.parse(recipe.generated_recipe);
                            // Successfully parsed: Use JSON title and formatted text
                            if (generatedRecipeJson && typeof generatedRecipeJson.title === 'string' && generatedRecipeJson.title.trim() !== '') {
                                displayTitle = generatedRecipeJson.title;
                            }
                            recipeDetailsHtml = `<pre class="original-recipe-text">${formatRecipeJsonToText(generatedRecipeJson) || 'Kon recept niet formatteren.'}</pre>`;

                        } catch (e) {
                            // Parsing failed: Log error, use fallback title, display raw text
                            console.error(`Recipe ID ${recipe.id}: Failed to parse generated_recipe JSON:`, e);
                            console.error("Invalid JSON string:", recipe.generated_recipe);
                            parseError = true;
                            // displayTitle remains recipe.idea or default
                            recipeDetailsHtml = `<pre class="original-recipe-text" style="color: #555;"><i>(Recept opgeslagen als platte tekst)</i></pre><pre>${recipe.generated_recipe}</pre>`;
                        }
                    } else {
                        // Missing or not a string: Use fallback title and indicate missing data
                        console.warn(`Recipe ID ${recipe.id}: Missing or invalid generated_recipe data.`);
                        displayTitle = recipe.idea || 'Recept Zonder Titel';
                        recipeDetailsHtml = `<pre class="original-recipe-text" style="color: red;">Geen receptgegevens gevonden.</pre>`;
                    }

                    let estimatedCostHtml = '';
                    if (recipe.estimated_total_cost !== null && recipe.estimated_total_cost !== undefined) {
                        // Format as currency (e.g., €1.50)
                        const cost = parseFloat(recipe.estimated_total_cost);
                        estimatedCostHtml = `<br><small>Geschatte Kosten: €${isNaN(cost) ? 'N/A' : cost.toFixed(2)}</small>`;
                    }

                    // Construct the list item HTML (recipeDetailsHtml is now set based on parse success/failure)
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
                body: JSON.stringify({ recipeId, refinementRequest: refinePrompt })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('[Refine Recipe] API Response Data:', data); // Log the whole response
            console.log('[Refine Recipe] Refined text from data:', data.recipe); // Log the specific field

            // --- This is the crucial line ---
            console.log('[Refine Recipe] Attempting to set refinedOutput.textContent'); // Log before setting
            refinedOutput.textContent = data.recipe; // <<< It should be data.recipe based on refineRecipe.js

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
    const displayRecipe = (data) => {
        if (!data || typeof data !== 'object' || !data.recipe || typeof data.recipe !== 'object') {
            recipeOutput.innerHTML = '<p>Fout: Ongeldige receptdata ontvangen.</p>';
            return;
        }

        const recipe = data.recipe;

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

        // --- Display Initial AI Cost Estimate ---
        if (data.initialEstimatedCost !== null && !isNaN(data.initialEstimatedCost)) {
            html += `<h3>Geschatte Kosten (AI):</h3><p>€${data.initialEstimatedCost.toFixed(2)}</p>`;
        }

        // --- >>> NEW: Add Placeholder for Breakdown <<< ---
        html += `<div id="cost-breakdown-${data.taskId}" class="cost-breakdown-container"><p><i>Kosten opbouw wordt geladen...</i></p></div>`;

        recipeOutput.innerHTML = html;
    };

    // --- >>> NEW: Function to Display Cost Breakdown <<< ---
    const displayCostBreakdown = (taskId, breakdownData) => {
        const container = document.getElementById(`cost-breakdown-${taskId}`);
        if (!container) {
            console.error(`Container for cost breakdown (ID: cost-breakdown-${taskId}) not found.`);
            return;
        }

        let html = ''; // Start with empty html

        // Check the type of calculation result
        switch (breakdownData?.calculationType) {
            case 'database':
                html = '<h3>Kosten Opbouw (Database):</h3>';
                if (!breakdownData.breakdown || !Array.isArray(breakdownData.breakdown)) {
                    html += '<p style="color: orange;">Fout bij weergeven database opbouw.</p>';
                    break;
                }
                html += '<ul>';
                breakdownData.breakdown.forEach(item => {
                    html += `<li>${item.name} (${item.quantity_string}): `;
                    if (item.status === 'ok' && item.cost !== null) {
                        html += `€${item.cost.toFixed(2)}`;
                    } else {
                        html += `<i style="color: #888;">(${item.status}: ${item.message || 'Kon niet berekenen'})</i>`;
                    }
                    html += '</li>';
                });
                html += '</ul>';
                html += `<p><b>Totaal Berekend (Database): €${breakdownData.totalCalculatedCost?.toFixed(2) || 'N/A'}</b></p>`;
                break;

            case 'ai':
                html = '<h3>Geschatte Kosten Opbouw (AI):</h3>';
                // Display raw AI text, maybe wrap in <pre> for formatting
                html += `<pre style="white-space: pre-wrap;">${breakdownData.aiBreakdownText || 'Kon AI opbouw niet weergeven.'}</pre>`;
                break;

            case 'database_failed':
                html = '<h3>Kosten Opbouw (Database):</h3>';
                html += '<p style="color: orange;">Database berekening onvolledig. Poging tot AI fallback mislukt (OpenAI niet geconfigureerd?).</p>';
                // Optionally display partial results from breakdownData.breakdown here
                break;

            case 'ai_failed':
                html = '<h3>Kosten Opbouw (Database):</h3>';
                html += '<p style="color: red;">Database berekening onvolledig. AI fallback ook mislukt.</p>';
                html += `<p><small>Fout: ${breakdownData.error || 'Onbekende AI fout'}</small></p>`;
                // Optionally display partial results from breakdownData.breakdown here
                break;

            default:
                // Handle unexpected or missing data structure
                console.error('Unexpected data structure received for cost breakdown:', breakdownData);
                html = '<p style="color: red;">Fout: Onverwacht antwoord ontvangen voor kosten opbouw.</p>';
                break;
        }

        container.innerHTML = html;
    };

    // --- >>> NEW: Function to Fetch Cost Breakdown <<< ---
    const fetchCostBreakdown = async (taskId) => {
        if (!taskId) return;
        console.log(`Fetching cost breakdown for task ID: ${taskId}`);
        try {
            const response = await fetch(`${getCostBreakdownApiUrl}?taskId=${taskId}`);
            if (!response.ok) {
                let errorMsg = `Fout bij ophalen kosten opbouw: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { /* Ignore if error response is not JSON */ }
                throw new Error(errorMsg);
            }
            const data = await response.json();
            displayCostBreakdown(taskId, data);
        } catch (error) {
            console.error('Error fetching cost breakdown:', error);
            // Display error in the breakdown container
            const container = document.getElementById(`cost-breakdown-${taskId}`);
            if (container) {
                container.innerHTML = `<p style="color: red;">Kon kosten opbouw niet laden: ${error.message}</p>`;
            }
        }
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
                displayRecipe(data);
                fetchCostBreakdown(data.taskId);
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
