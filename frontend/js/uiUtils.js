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

let activeConfirmationResolver = null;
let activeImageModalCloseHandler = null;
let activeModalOutsideClickHandler = null;

// Get modal elements once
const confirmationModal = document.getElementById('confirmation-modal');
const modalMessageElement = document.getElementById('modal-message');
const modalConfirmButton = document.getElementById('modal-confirm-button');
const modalCancelButton = document.getElementById('modal-cancel-button');

const imageDisplayModal = document.getElementById('image-modal');
const modalImageElement = document.getElementById('modal-image');
const modalCaptionElement = document.getElementById('image-modal-caption');
const imageModalCloseButton = imageDisplayModal?.querySelector('.close-image-modal'); // Use optional chaining for safety

// Ensure modals are hidden on script load, just in case CSS is slow or overridden
if (confirmationModal) confirmationModal.classList.remove('active');
if (imageDisplayModal) imageDisplayModal.classList.remove('active');

/**
 * Displays a confirmation modal and executes callbacks based on user choice.
 * @param {string} message - The message to display in the modal.
 * @returns {Promise<boolean>} - Promise that resolves to true if confirmed, false if cancelled.
 */
export function showConfirmationModal(message) {
    return new Promise((resolve) => {
        if (!confirmationModal || !modalMessageElement || !modalConfirmButton || !modalCancelButton) {
            console.error('Confirmation modal elements not found!');
            // Fallback to default confirm if modal is broken
            resolve(window.confirm(message));
            return;
        }

        modalMessageElement.textContent = message;

        // Clean up previous listeners if any
        if (activeConfirmationResolver) {
            modalConfirmButton.removeEventListener('click', activeConfirmationResolver.handleConfirm);
            modalCancelButton.removeEventListener('click', activeConfirmationResolver.handleCancel);
            confirmationModal.removeEventListener('click', activeModalOutsideClickHandler);
        }

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const handleModalClick = (event) => {
            if (event.target === confirmationModal) {
                handleCancel();
            }
        };

        const cleanup = () => {
            confirmationModal.classList.remove('active');
            modalConfirmButton.removeEventListener('click', handleConfirm);
            modalCancelButton.removeEventListener('click', handleCancel);
            confirmationModal.removeEventListener('click', handleModalClick);
            activeConfirmationResolver = null;
            activeModalOutsideClickHandler = null;
        };

        activeConfirmationResolver = { handleConfirm, handleCancel };
        activeModalOutsideClickHandler = handleModalClick;

        modalConfirmButton.addEventListener('click', handleConfirm);
        modalCancelButton.addEventListener('click', handleCancel);
        confirmationModal.addEventListener('click', handleModalClick);

        confirmationModal.classList.add('active');
    });
}

/**
 * Displays a modal with an image.
 * @param {string} imageUrl - The URL of the image to display.
 * @param {string} [caption] - Optional caption for the image.
 */
export function showImageModal(imageUrl, caption = 'Gegenereerd beeld') {
    if (!imageDisplayModal || !modalImageElement || !modalCaptionElement || !imageModalCloseButton) {
        console.error('Image modal elements not found!');
        window.open(imageUrl, '_blank');
        return;
    }

    modalImageElement.src = imageUrl;
    modalImageElement.alt = caption;
    modalCaptionElement.textContent = caption;

    // Clean up previous listeners if any
    if (activeImageModalCloseHandler) {
        imageModalCloseButton.removeEventListener('click', activeImageModalCloseHandler);
        imageDisplayModal.removeEventListener('click', activeModalOutsideClickHandler);
    }

    const handleClose = () => {
        imageDisplayModal.classList.remove('active');
        imageModalCloseButton.removeEventListener('click', handleClose);
        imageDisplayModal.removeEventListener('click', handleModalClick);
        activeImageModalCloseHandler = null;
        activeModalOutsideClickHandler = null;
    };

    const handleModalClick = (event) => {
        if (event.target === imageDisplayModal) {
            handleClose();
        }
    };

    activeImageModalCloseHandler = handleClose;
    activeModalOutsideClickHandler = handleModalClick;

    imageModalCloseButton.addEventListener('click', handleClose);
    imageDisplayModal.addEventListener('click', handleModalClick);

    imageDisplayModal.classList.add('active');
}

// Ensure other exports are kept if they exist
// export { displayErrorToast, setButtonLoading, showConfirmationModal, /* other exports */ };
