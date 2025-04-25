document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const ideaInput = document.getElementById('broodje-idee');
    const recipeOutput = document.getElementById('recept-output');
    const loadingIndicator = document.getElementById('loading');
    const loadingListIndicator = document.getElementById('loading-list');
    const recipeList = document.getElementById('recepten-lijst');

    // API Endpoints
    const generateApiUrl = '/api/generate'; 
    const getRecipesApiUrl = '/api/getRecipes';

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
                } catch (e) {}
                throw new Error(errorMsg);
            }
            const data = await response.json();
            
            if (data.recipes && data.recipes.length > 0) {
                 data.recipes.forEach(recipe => {
                    const listItem = document.createElement('li');
                    // Displaying idea and maybe a snippet or date
                    listItem.innerHTML = `<b>${recipe.idea || 'Onbekend Idee'}</b> <br> <small>Opgeslagen op: ${new Date(recipe.created_at).toLocaleString()}</small> <details><summary>Bekijk Recept</summary><pre>${recipe.generated_recipe || 'Geen recept data'}</pre></details>`;
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

    // Generate button event listener
    generateBtn.addEventListener('click', async () => {
        const idea = ideaInput.value.trim();
        if (!idea) {
            alert('Voer alsjeblieft een broodjesidee in.');
            return;
        }

        recipeOutput.textContent = '';
        loadingIndicator.style.display = 'block';
        generateBtn.disabled = true;

        try {
            const response = await fetch(generateApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ idea: idea })
            });

            if (!response.ok) {
                let errorMsg = `Fout: ${response.status}`;
                 try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            recipeOutput.textContent = data.recipe;
            
            // --- Refresh the list after generating a new recipe ---
            loadRecipes(); 
            // -------------------------------------------------------

        } catch (error) {
            console.error('Error generating recipe:', error);
            recipeOutput.textContent = `Kon het recept niet genereren: ${error.message}`;
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

    // --- Initial load of recipes when the page loads ---
    loadRecipes();
    // ---------------------------------------------------
});