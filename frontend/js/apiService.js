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

// Helper function for handling fetch responses
async function handleResponse(response) {
    if (!response.ok) {
        let errorData = { message: `HTTP error! status: ${response.status}` };
        try {
            // Try to parse error response from backend
            const backendError = await response.json();
            errorData.message = backendError.error || backendError.message || errorData.message;
            errorData.details = backendError; // Include full backend error if available
        } catch (e) {
            // Ignore if response is not JSON or parsing fails
        }
        const error = new Error(errorData.message);
        error.details = errorData.details;
        error.status = response.status;
        throw error;
    }
    // Check if response has content before parsing JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    }
    // Return text or handle other content types if necessary
    return await response.text();
}

// --- Exported API Functions ---

export async function generateRecipe(ingredients, type, model) {
    const response = await fetch(GENERATE_RECIPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: ingredients, type: type, model: model })
    });
    return handleResponse(response);
}

export async function getCostBreakdown(taskId) {
    const response = await fetch(`${GET_COST_BREAKDOWN_URL}?taskId=${taskId}`);
    return handleResponse(response);
}

export async function getRecipes() {
    const response = await fetch(GET_RECIPES_URL);
    return handleResponse(response);
}

export async function refineRecipe(recipeId, refinementRequest) {
    const response = await fetch(REFINE_RECIPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, refinementRequest })
    });
    return handleResponse(response);
}

export async function clearAllRecipes() {
    const response = await fetch(CLEAR_RECIPES_URL, { method: 'POST' });
    // Doesn't return JSON, handle appropriately if needed
    if (!response.ok) {
        let errorData = { message: `HTTP error! status: ${response.status}` };
        try { const backendError = await response.json(); errorData.message = backendError.error || errorData.message; } catch (e) { }
        const error = new Error(errorData.message);
        error.status = response.status;
        throw error;
    }
    return true; // Indicate success
}

export async function getIngredients() {
    const response = await fetch(GET_INGREDIENTS_URL);
    return handleResponse(response);
}

export async function addIngredient(name, unit, price_per_unit) {
    const response = await fetch(ADD_INGREDIENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unit, price_per_unit })
    });
    return handleResponse(response);
}

export async function deleteIngredient(ingredientId) {
    const response = await fetch(DELETE_INGREDIENT_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ingredientId })
    });
    // Assuming DELETE returns success/failure info in JSON
    return handleResponse(response);
}

// Note: Update ingredient functionality was mentioned as an API endpoint
// but not implemented in the original script's event handling.
// export async function updateIngredient(id, data) { ... }
