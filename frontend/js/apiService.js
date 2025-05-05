// API Endpoint Constants
const GENERATE_RECIPE_URL = '/api/generateRecipe';
const GET_RECIPES_URL = '/api/getRecipes';
const GET_INGREDIENTS_URL = '/api/getIngredients';
const ADD_INGREDIENT_URL = '/api/addIngredient';
const UPDATE_INGREDIENT_URL = '/api/updateIngredient'; // Not implemented in original script?
const DELETE_INGREDIENT_URL = '/api/deleteIngredient';
const REFINE_RECIPE_URL = '/api/refineRecipe';
const CLEAR_RECIPES_URL = '/api/clearRecipes';
const GET_COST_BREAKDOWN_URL = '/api/getCostBreakdown';
const GET_CONFIG_URL = '/api/getConfig';

// Updated helper function for handling fetch responses
async function handleResponse(response) {
    if (!response.ok) {
        let errorPayload = { // Default error payload
            message: `HTTP error! Status: ${response.status}`,
            code: 'HTTP_ERROR',
            details: `URL: ${response.url}`
        };
        try {
            // Try to parse the standardized error response from backend
            const backendErrorData = await response.json();
            if (backendErrorData && backendErrorData.error && typeof backendErrorData.error === 'object') {
                // Use the standardized structure if available
                errorPayload = {
                    message: backendErrorData.error.message || errorPayload.message,
                    code: backendErrorData.error.code || 'BACKEND_ERROR',
                    details: backendErrorData.error.details || errorPayload.details
                    // Include other fields like taskId or ingredientId if needed later
                };
            } else if (backendErrorData && backendErrorData.error) {
                // Fallback if backendError.error is just a string
                errorPayload.message = backendErrorData.error;
            }
        } catch (e) {
            // Ignore if response is not JSON or parsing fails, keep default payload
            console.warn('Could not parse error response body as JSON.');
        }

        // Create a custom error object or just throw the payload
        // Throwing the payload allows the caller to access code/details easily
        console.error('API Error Payload:', errorPayload); // Log the structured error
        throw errorPayload; // Throw the structured error object
    }

    // Handle successful responses (unchanged)
    const contentType = response.headers.get("content-type");
    if (response.status === 204) { // Handle No Content specifically
        return null; // Or return true, depending on how the caller expects it
    }
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    }
    return await response.text();
}

// --- Exported API Functions ---

// --- Config (NEW) ---
export async function getConfig() {
    const url = GET_CONFIG_URL;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        // Use the existing handleResponse for consistency
        return await handleResponse(response);
    } catch (error) {
        console.error(`Error in getConfig from ${url}:`, error);
        // Re-throw the error object/payload provided by handleResponse or fetch error
        throw error;
    }
}

// --- Recipes ---

export async function generateRecipe(ingredients, model) {
    // Get the GCF URL (assuming it's stored globally after fetchAppConfig runs)
    const gcfUrl = window.appConfig?.gcfGenerateBroodjeUrl;
    if (!gcfUrl) {
        console.error('generateRecipe Error: GCF URL for recipe generation not found in appConfig.');
        throw new Error('Client configuration error: Missing GCF URL.');
    }

    // Call the GCF directly
    const response = await fetch(gcfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            ingredients: ingredients,
            type: 'broodje',
            model: model,
            language: 'Nederlands' // Pass language if needed by GCF
        }),
        mode: 'cors' // Ensure CORS mode is set
    });

    // Use the existing handleResponse for error handling and JSON parsing
    const result = await handleResponse(response);

    // Still invalidate recipe cache if needed
    try {
        sessionStorage.removeItem('recipes');
    } catch (e) {
        console.warn('Failed to remove recipes from sessionStorage:', e);
    }
    return result; // Result should be { taskId: ..., recipe: {...} } from GCF
}

export async function getCostBreakdown(taskId) {
    const response = await fetch(`${GET_COST_BREAKDOWN_URL}?taskId=${taskId}`);
    return handleResponse(response);
}

export async function getRecipes() {
    const cacheKey = 'recipes';
    try {
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
            console.log('Serving recipes from cache');
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.warn('Failed to read recipes from sessionStorage:', e);
    }

    console.log('Fetching recipes from API');
    const response = await fetch(GET_RECIPES_URL);
    const data = await handleResponse(response);

    try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save recipes to sessionStorage:', e);
    }
    return data;
}

export async function refineRecipe(recipeId, refinementRequest) {
    const response = await fetch(REFINE_RECIPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, refinementRequest })
    });
    const result = await handleResponse(response);
    try {
        sessionStorage.removeItem('recipes'); // Invalidate cache
    } catch (e) {
        console.warn('Failed to remove recipes from sessionStorage:', e);
    }
    return result;
}

export async function clearAllRecipes() {
    const response = await fetch(CLEAR_RECIPES_URL, { method: 'POST' });
    const result = await handleResponse(response);
    try {
        sessionStorage.removeItem('recipes'); // Invalidate cache
    } catch (e) {
        console.warn('Failed to remove recipes from sessionStorage:', e);
    }
    return result;
}

// --- Ingredients ---

export async function getIngredients() {
    const cacheKey = 'ingredients';
    try {
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
            console.log('Serving ingredients from cache');
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.warn('Failed to read ingredients from sessionStorage:', e);
    }

    console.log('Fetching ingredients from API');
    const response = await fetch(GET_INGREDIENTS_URL);
    const data = await handleResponse(response);

    try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save ingredients to sessionStorage:', e);
    }
    return data;
}

export async function addIngredient(name, unit, price_per_unit) {
    const response = await fetch(ADD_INGREDIENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unit, price_per_unit })
    });
    const result = await handleResponse(response);
    try {
        sessionStorage.removeItem('ingredients'); // Invalidate cache
    } catch (e) {
        console.warn('Failed to remove ingredients from sessionStorage:', e);
    }
    return result;
}

export async function deleteIngredient(ingredientId) {
    const response = await fetch(`${DELETE_INGREDIENT_URL}?id=${ingredientId}`, {
        method: 'DELETE'
    });
    const result = await handleResponse(response);
    try {
        sessionStorage.removeItem('ingredients'); // Invalidate cache
    } catch (e) {
        console.warn('Failed to remove ingredients from sessionStorage:', e);
    }
    return result;
}

// Note: Update ingredient functionality was mentioned as an API endpoint
// but not implemented in the original script's event handling.
// If implemented, add sessionStorage.removeItem('ingredients');
// export async function updateIngredient(id, data) { ... }

/**
 * Calls the GCF to generate an image visualization for a specific recipe task.
 * @param {string} taskId - The ID of the recipe task.
 * @returns {Promise<object>} - Promise resolving to { imageUrl: '...' } or throwing an error.
 */
export async function visualizeBroodje(taskId) {
    // Ensure config is loaded
    await ensureConfigLoaded();

    if (!appConfig.gcfVisualizeBroodjeUrl) {
        console.error('visualizeBroodje Error: GCF_VISUALIZE_BROODJE_URL not configured.');
        throw new Error('Visualisatie functie is niet geconfigureerd.');
    }

    console.log(`Calling visualize GCF for taskId: ${taskId}`);
    const response = await fetch(appConfig.gcfVisualizeBroodjeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('visualizeBroodje API Error:', data);
        const errorMessage = data?.error?.details || data?.error || 'Kon broodje niet visualiseren.';
        throw new Error(errorMessage);
    }

    console.log('visualizeBroodje response:', data);
    if (!data.imageUrl) {
        throw new Error('Geen image URL ontvangen van visualisatie functie.');
    }

    return data; // Should contain { imageUrl: '...' }
}

// Helper function to load config if not already loaded
async function ensureConfigLoaded() {
    if (!appConfig.gcfImageUrl || !appConfig.gcfGenerateBroodjeUrl || !appConfig.gcfVisualizeBroodjeUrl) {
        console.log('Config not fully loaded, fetching...');
        await fetchAppConfig(); // Assuming fetchAppConfig is available globally or imported
        // Re-check after fetching
        if (!appConfig.gcfImageUrl || !appConfig.gcfGenerateBroodjeUrl || !appConfig.gcfVisualizeBroodjeUrl) {
            console.error('Failed to load necessary configuration after fetch attempt.');
            // Depending on the flow, you might throw an error here
            // or rely on subsequent checks to fail.
        }
    }
}
