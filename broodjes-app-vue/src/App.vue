<template>
  <div id="app-container">
    <header>
      <h1>Broodjes AI App met Vue</h1>
      <nav>
        <router-link to="/" :class="{ active: route.name === 'Generate' }">Nieuw Recept</router-link>
        <router-link to="/recepten" :class="{ active: route.name === 'Recipes' }">Opgeslagen Recepten</router-link>
        <router-link to="/ingredienten" :class="{ active: route.name === 'Ingredients' }">Ingrediënten</router-link>
      </nav>
    </header>
    <main>
      <ErrorBoundary>
        <router-view />
      </ErrorBoundary>
    </main>
    <footer>
      <p>&copy; 2024 Broodjes App Inc.</p>
    </footer>

    <!-- De ImageModal wordt hier globaal gehouden en getoond/verborgen op basis van data -->
    <ImageModal
      :show="showModal"
      :image-url="modalImageUrl"
      :title="modalTitle"
      @close="showModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import ImageModal from './components/ImageModal.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';

// Get current route for navigation highlighting
const route = useRoute();

// Data voor de modal
const showModal = ref<boolean>(false);
const modalImageUrl = ref<string>('');
const modalTitle = ref<string>('');

// Type voor de globale window functie
declare global {
  interface Window {
    displayGlobalModal?: (imageUrl: string, title: string) => void;
  }
}

// Functie om modal te tonen
const displayModal = (imageUrl: string, title: string): void => {
  modalImageUrl.value = imageUrl;
  modalTitle.value = title;
  showModal.value = true;
};

// Voeg de functie toe aan het window object bij het mounten
onMounted(() => {
  window.displayGlobalModal = displayModal;
});

// Verwijder de functie van het window object bij het unmounten
onUnmounted(() => {
  if (window.displayGlobalModal === displayModal) {
    delete window.displayGlobalModal;
  }
});
</script>

<style scoped>
/* App-specific styles using design system */
#app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-xl);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

header {
  background-color: var(--color-primary);
  color: var(--color-white);
  padding: var(--spacing-xl);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-xl);
  text-align: center;
  box-shadow: var(--shadow-md);
}

header h1 {
  margin: 0 0 var(--spacing-lg) 0;
  font-size: var(--font-3xl);
  font-weight: var(--font-bold);
}

nav {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
}

nav a {
  background-color: var(--color-primary-hover);
  color: var(--color-white);
  border: none;
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-md);
  font-weight: var(--font-medium);
  transition: all var(--transition-normal);
  text-decoration: none;
  display: inline-block;
  min-width: 140px;
  text-align: center;
}

nav a:hover {
  background-color: #3d8b40;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

nav a.active {
  background-color: #2e7d32;
  font-weight: var(--font-semibold);
  box-shadow: var(--shadow-md);
}

main {
  min-height: 60vh;
  margin-bottom: var(--spacing-xl);
}

footer {
  text-align: center;
  padding: var(--spacing-xl);
  background-color: var(--bg-secondary);
  border-radius: var(--radius-lg);
  margin-top: var(--spacing-xl);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
}

/* Responsive design using design system breakpoints */
@media (max-width: 768px) {
  #app-container {
    padding: var(--spacing-lg);
  }

  header {
    padding: var(--spacing-lg);
  }

  header h1 {
    font-size: var(--font-2xl);
    margin-bottom: var(--spacing-md);
  }

  nav {
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
  }

  nav a {
    width: 80%;
    margin: var(--spacing-xs) 0;
    min-width: auto;
  }

  main {
    margin-bottom: var(--spacing-lg);
  }

  footer {
    padding: var(--spacing-lg);
    margin-top: var(--spacing-lg);
  }
}

@media (max-width: 480px) {
  nav a {
    width: 90%;
    font-size: var(--font-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
  }
}
</style>
