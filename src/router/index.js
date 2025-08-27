import { createRouter, createWebHistory } from 'vue-router';
import GenerateView from '../components/GenerateView.vue';

// Placeholder imports - we maken deze bestanden later aan
const IngredientDbView = { template: '<div>Ingredient DB View (Placeholder)</div>' };
const RecipeListView = { template: '<div>Recipe List View (Placeholder)</div>' };

const routes = [
    {
        path: '/',
        name: 'Generate',
        component: GenerateView
    },
    {
        path: '/ingredienten',
        name: 'Ingredients',
        component: IngredientDbView
    },
    {
        path: '/recepten',
        name: 'Recipes',
        component: RecipeListView
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router
