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

/**
 * Displays a confirmation modal and executes callbacks based on user choice.
 * @param {string} message - The message to display in the modal.
 * @param {function} onConfirm - Callback function to execute if the user confirms.
 * @param {function} [onCancel] - Optional callback function to execute if the user cancels.
 */
export function showConfirmationModal(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirmation-modal');
    const messageElement = document.getElementById('modal-message');
    const confirmButton = document.getElementById('modal-confirm-button');
    const cancelButton = document.getElementById('modal-cancel-button');

    if (!modal || !messageElement || !confirmButton || !cancelButton) {
        console.error('Modal elements not found!');
        // Fallback to default confirm if modal is broken
        if (window.confirm(message)) {
            onConfirm();
        }
        return;
    }

    // Set the message
    messageElement.textContent = message;

    // Function to hide modal and clean up listeners
    const cleanup = () => {
        modal.classList.remove('active');
        confirmButton.removeEventListener('click', handleConfirm);
        cancelButton.removeEventListener('click', handleCancel);
        // Optional: Add listener for clicking outside the modal content to cancel
        modal.removeEventListener('click', handleOutsideClick);
    };

    // Event handler for confirmation
    const handleConfirm = () => {
        cleanup();
        onConfirm(); // Execute the confirmation callback
    };

    // Event handler for cancellation
    const handleCancel = () => {
        cleanup();
        if (onCancel) {
            onCancel(); // Execute the cancel callback if provided
        }
    };

    // Optional: Handle clicks outside the modal content
    const handleOutsideClick = (event) => {
        if (event.target === modal) { // Check if the click was on the overlay itself
            handleCancel();
        }
    };

    // Remove previous listeners (important if modal is reused rapidly)
    // Note: A more robust approach might involve cloning and replacing nodes,
    // but this works for simple cases.
    confirmButton.replaceWith(confirmButton.cloneNode(true));
    cancelButton.replaceWith(cancelButton.cloneNode(true));
    // Re-select buttons after cloning
    const newConfirmButton = document.getElementById('modal-confirm-button');
    const newCancelButton = document.getElementById('modal-cancel-button');

    // Add new listeners
    newConfirmButton.addEventListener('click', handleConfirm);
    newCancelButton.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleOutsideClick);

    // Show the modal
    modal.classList.add('active');
}

/**
 * Displays a modal with an image.
 * @param {string} imageUrl - The URL of the image to display.
 * @param {string} [caption] - Optional caption for the image.
 */
export function showImageModal(imageUrl, caption = 'Gegenereerd beeld') {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const captionElement = document.getElementById('image-modal-caption');
    const closeButton = modal.querySelector('.close-image-modal');

    if (!modal || !modalImage || !captionElement || !closeButton) {
        console.error('Image modal elements not found!');
        // Fallback or alternative display if needed
        window.open(imageUrl, '_blank'); // Open in new tab as fallback
        return;
    }

    modalImage.src = imageUrl;
    modalImage.alt = caption;
    captionElement.textContent = caption;

    const close = () => {
        modal.classList.remove('active');
        closeButton.removeEventListener('click', close);
        modal.removeEventListener('click', handleOutsideClick);
    };

    const handleOutsideClick = (event) => {
        if (event.target === modal) { // Click on overlay closes modal
            close();
        }
    };

    // Add listeners
    closeButton.addEventListener('click', close);
    modal.addEventListener('click', handleOutsideClick);

    // Show the modal
    modal.classList.add('active');
}

// Ensure other exports are kept if they exist
// export { displayErrorToast, setButtonLoading, showConfirmationModal, /* other exports */ };
