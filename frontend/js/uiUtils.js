// Generic function to toggle display of an element
function setLoadingState(elementId, isLoading) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = isLoading ? 'block' : 'none';
    } else {
        console.warn(`Loading indicator element not found: ${elementId}`);
    }
}

// Specific loading indicators based on original script IDs
export function showLoading(indicatorId = 'loading') {
    setLoadingState(indicatorId, true);
}

export function hideLoading(indicatorId = 'loading') {
    setLoadingState(indicatorId, false);
}

export function showListLoading() {
    setLoadingState('loading-list', true);
}

export function hideListLoading() {
    setLoadingState('loading-list', false);
}

export function showIngredientsLoading() {
    setLoadingState('loading-ingredients', true);
}

export function hideIngredientsLoading() {
    setLoadingState('loading-ingredients', false);
}

// Add more UI utilities here as needed, e.g.,
// - Clearing form fields
// - Displaying feedback messages
// - Toggling button disabled states

export function setButtonLoading(buttonElement, isLoading, loadingText = 'Processing...') {
    if (!buttonElement) return;

    if (isLoading) {
        buttonElement.dataset.originalText = buttonElement.textContent;
        buttonElement.textContent = loadingText;
        buttonElement.disabled = true;
    } else {
        buttonElement.textContent = buttonElement.dataset.originalText || 'Submit';
        buttonElement.disabled = false;
        delete buttonElement.dataset.originalText; // Clean up
    }
}

// Utility to display error messages to the user (simple alert for now)
export function displayErrorToast(message) {
    console.error("Displaying Error: ", message); // Keep logging the error
    // Replace this with a more sophisticated toast/notification library later
    alert(`Fout: ${message}`);
}
