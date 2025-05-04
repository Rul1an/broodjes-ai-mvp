// Import functions that will be defined in other view modules
// We need these to load data when a view becomes active.
import { loadIngredients } from './ingredientView.js';
import { loadRecipes } from './recipeListView.js';

// DOM Elements specific to navigation
let navigationButtons;
let views;

// Function to switch the active view
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

    // Load data for the activated view
    if (viewId === 'view-recipes') {
        console.log("Switching to Recipes view, triggering loadRecipes...");
        loadRecipes();
    }
    if (viewId === 'view-ingredients') {
        console.log("Switching to Ingredients view, triggering loadIngredients...");
        loadIngredients();
    }
};

// Initialization function for navigation
export function setupNavigation() {
    console.log("Setting up navigation...");
    navigationButtons = document.querySelectorAll('.nav-button');
    views = document.querySelectorAll('.view');

    if (!navigationButtons.length || !views.length) {
        console.error("Navigation elements not found!");
        return;
    }

    navigationButtons.forEach(button => {
        button.addEventListener('click', () => {
            setActiveView(button.dataset.view);
        });
    });

    // Set initial view based on the first button or a default
    const initialView = navigationButtons[0]?.dataset.view || 'view-generate'; // Default to generate view
    console.log(`Setting initial view to: ${initialView}`);
    setActiveView(initialView);
}
