// broodjes-app-vue/src/services/apiService.js

// Base URL voor de Netlify API functies
const API_BASE_URL = '/api';

// Endpoints (relatief aan API_BASE_URL)
const GENERATE_ENDPOINT = '/generate';
const VISUALIZE_ENDPOINT = (taskId) => `/visualize/${taskId}`;
const TASK_STATUS_ENDPOINT = (taskId) => `/task-status/${taskId}`;
const RECIPES_ENDPOINT = '/getRecipes'; // Voorbeeld, pas aan indien nodig
const INGREDIENTS_ENDPOINT = '/getIngredients'; // Voorbeeld
const ADD_INGREDIENT_ENDPOINT = '/addIngredient'; // Voorbeeld
const DELETE_INGREDIENT_ENDPOINT = (id) => `/deleteIngredient?id=${id}`; // Voorbeeld
// Voeg hier andere backend endpoints toe...

/**
 * Helper functie voor het afhandelen van fetch requests naar de Netlify API laag.
 * Standaardiseert error handling en JSON parsing.
 * @param {string} endpoint - Het endpoint pad (bv. '/generate').
 * @param {object} options - Fetch options (method, headers, body, etc.).
 * @returns {Promise<object|null>} - De JSON response data of null bij 204.
 * @throws {object} - Gooit een gestandaardiseerd error object.
 */
async function fetchApi(endpoint, options = {}) {
    const requestUrl = `${API_BASE_URL}${endpoint}`;
    console.log(`API Call: ${options.method || 'GET'} ${requestUrl}`);

    const fetchOptions = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
    };
    // Verwijder Content-Type voor GET/HEAD requests zonder body
    if (!options.body && (!options.method || ['GET', 'HEAD'].includes(options.method.toUpperCase()))) {
        delete fetchOptions.headers['Content-Type'];
    }

    try {
        const response = await fetch(requestUrl, fetchOptions);

        // --- Error Handling ---
        if (!response.ok) {
            let errorPayload = {
                message: `API Error: ${response.status} ${response.statusText}`,
                code: 'HTTP_ERROR',
                status: response.status,
                details: `URL: ${requestUrl}`
            };
            try {
                const backendErrorData = await response.json();
                // Probeer specifieke error structuur van backend te lezen
                if (backendErrorData?.error?.message || backendErrorData?.message || backendErrorData?.error) {
                    errorPayload.message = backendErrorData.error?.message || backendErrorData.message || backendErrorData.error;
                    errorPayload.code = backendErrorData.error?.code || 'BACKEND_ERROR';
                    if (backendErrorData.error?.details) errorPayload.details = backendErrorData.error.details;
                }
            } catch (e) {
                console.warn('Could not parse error response body as JSON.');
            }
            console.error('API Error Payload:', errorPayload);
            throw errorPayload;
        }

        // --- Success Handling ---
        if (response.status === 204) {
            return null; // Geen inhoud
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json(); // Verwachte JSON response
        }

        // Fallback voor non-JSON responses (indien nodig)
        console.warn(`Response from ${requestUrl} was not JSON.`);
        return await response.text(); // Of null?

    } catch (error) {
        // Hergooi de error (network error of de errorPayload)
        console.error(`Fetch error for ${requestUrl}:`, error);
        throw error;
    }
}

// --- Exported API Functies ---

/**
 * Vraagt de backend (Netlify Function) om een nieuw recept te genereren.
 * De Netlify functie roept de Generate GCF aan.
 * @param {object} options - { theme?, extra_ingredients?, style? }
 * @returns {Promise<object>} Response van de Netlify functie (bv. { recipe: object, taskId: string })
 */
export async function generateRecipe({ theme, extra_ingredients, style }) {
    return fetchApi(GENERATE_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ theme, extra_ingredients, style }),
    });
}

/**
 * Vraagt de backend (Netlify Function) om de visualisatie voor een recept te starten.
 * De Netlify functie roept de Visualize GCF aan.
 * @param {string} taskId
 * @returns {Promise<object>} Response van de Netlify functie (bv. { success: true, status: 'pending' })
 */
export async function visualizeRecipe(taskId) {
    return fetchApi(VISUALIZE_ENDPOINT(taskId), {
        method: 'POST', // Aanname: POST start het proces
        // Body is mogelijk niet nodig als taskId in de URL staat
    });
}

/**
 * Pollt de backend (Netlify Function) voor de status van een asynchrone taak.
 * De Netlify functie checkt de database.
 * @param {string} taskId
 * @returns {Promise<object>} Response (bv. { status: 'pending'|'completed'|'failed', imageUrl?: string, error?: string })
 */
export async function getTaskStatus(taskId) {
    return fetchApi(TASK_STATUS_ENDPOINT(taskId), {
        method: 'GET',
    });
}

// --- Andere API Functies (Voorbeelden - pas aan naar jouw endpoints) ---

export async function getRecipes() {
    return fetchApi(RECIPES_ENDPOINT, { method: 'GET' });
}

export async function getIngredients() {
    return fetchApi(INGREDIENTS_ENDPOINT, { method: 'GET' });
}

export async function addIngredient(name, unit, price_per_unit) {
    return fetchApi(ADD_INGREDIENT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ name, unit, price_per_unit })
    });
    // Invalidate cache / update state in de aanroepende component
}

export async function deleteIngredient(ingredientId) {
    return fetchApi(DELETE_INGREDIENT_ENDPOINT(ingredientId), {
        method: 'DELETE'
    });
    // Invalidate cache / update state in de aanroepende component
}

// Voeg hier andere functies toe zoals updateIngredient, clearRecipes etc.
// export async function updateIngredient(id, data) { ... }
// export async function clearAllRecipes() { ... }

// Exporteer alle benodigde functies
export default {
    generateRecipe,
    visualizeRecipe, // Hernoemd van startVisualization
    getTaskStatus,
    getRecipes,
    getIngredients,
    addIngredient,
    deleteIngredient,
    // ...andere geëxporteerde functies
};
