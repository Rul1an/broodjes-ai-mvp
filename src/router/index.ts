import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import GenerateView from '../components/GenerateView.vue';

// Importeer de componenten die je wilt gebruiken
const IngredientDbView = { template: '<div>Ingredient DB View (Placeholder)</div>' };
const RecipeListView = () => import('../components/RecipeListView.vue');

// Definieer de routes met TypeScript types
const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Generate',
    component: GenerateView,
    meta: {
      title: 'Nieuw Recept Genereren'
    }
  },
  {
    path: '/ingredienten',
    name: 'Ingredients',
    component: IngredientDbView,
    meta: {
      title: 'Ingrediënten Database'
    }
  },
  {
    path: '/recepten',
    name: 'Recipes',
    component: RecipeListView,
    meta: {
      title: 'Opgeslagen Recepten'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

// Maak de router instantie
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // Scroll naar boven bij route verandering
    return { top: 0 };
  }
});

// Voeg een navigation guard toe om de paginatitel bij te werken
router.beforeEach((to, _, next) => {
  document.title = to.meta.title ? `Broodjes App - ${to.meta.title as string}` : 'Broodjes App';
  next();
});

export default router;
