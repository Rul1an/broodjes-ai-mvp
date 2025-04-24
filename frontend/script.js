document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const ideaInput = document.getElementById('broodje-idee');
    const recipeOutput = document.getElementById('recept-output');
    const loadingIndicator = document.getElementById('loading');

    // Set the backend URL (ensure the backend is running on this port)
    const backendUrl = 'http://127.0.0.1:5001/generate';

    generateBtn.addEventListener('click', async () => {
        const idea = ideaInput.value.trim();
        if (!idea) {
            alert('Voer alsjeblieft een broodjesidee in.');
            return;
        }

        // Clear previous results and show loading
        recipeOutput.textContent = '';
        loadingIndicator.style.display = 'block';
        generateBtn.disabled = true; // Disable button during request

        try {
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ idea: idea })
            });

            if (!response.ok) {
                // Try to get error message from backend response
                let errorMsg = `Fout: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { /* Ignore if response is not JSON */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            recipeOutput.textContent = data.recipe;

        } catch (error) {
            console.error('Error fetching recipe:', error);
            recipeOutput.textContent = `Kon het recept niet genereren: ${error.message}`;
        } finally {
            // Hide loading and re-enable button
            loadingIndicator.style.display = 'none';
            generateBtn.disabled = false;
        }
    });

    // Optional: Allow pressing Enter in the input field to trigger generation
    ideaInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission
            generateBtn.click(); // Trigger button click
        }
    });
});