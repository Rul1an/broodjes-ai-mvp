import { setupGenerateView } from './views/generateView.js';
import { setupIngredientView } from './views/ingredientView.js';
import { setupNavigation } from './views/navigation.js';
import { setupRecipeListView } from './views/recipeListView.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");

    setupNavigation();
    setupGenerateView();
    setupRecipeListView();
    setupIngredientView();

    console.log("All modules initialized.");
});
