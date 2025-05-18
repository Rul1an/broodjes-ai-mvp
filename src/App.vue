<template>
  <div id="app-container">
    <header>
      <h1>Broodjes AI App met Vue</h1>
      <nav>
        <button @click="activeTab = 'generate'" :class="{ active: activeTab === 'generate' }">Nieuw Recept</button>
        <button @click="activeTab = 'list'" :class="{ active: activeTab === 'list' }">Opgeslagen Recepten</button>
      </nav>
    </header>
    <main>
      <GenerateView v-if="activeTab === 'generate'" />
      <RecipeListView v-else-if="activeTab === 'list'" />
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
import GenerateView from './components/GenerateView.vue';
import RecipeListView from './components/RecipeListView.vue';
import ImageModal from './components/ImageModal.vue';

type ActiveTab = 'generate' | 'list';

const activeTab = ref<ActiveTab>('generate');

// Data voor de modal
const showModal = ref<boolean>(false);
const modalImageUrl = ref<string>('');
const modalTitle = ref<string>('');

// Type voor de globale window functie
declare global {
  interface Window {
    displayGlobalModal: (imageUrl: string, title: string) => void;
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
  (window as any).displayGlobalModal = displayModal;
});

// Verwijder de functie van het window object bij het unmounten
onUnmounted(() => {
  if (window.displayGlobalModal === displayModal) {
    (window as any).displayGlobalModal = undefined; // Or ensure Window interface is extended
  }
});
</script>

<style>
/* Bestaande stijlen hier */
#app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

header {
  background-color: #4CAF50;
  color: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
}

header h1 {
  margin: 0 0 15px 0;
  font-size: 2.2em;
}

nav {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 15px;
}

nav button {
  background-color: #45a049;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
  transition: background-color 0.3s;
}

nav button:hover {
  background-color: #3d8b40;
}

nav button.active {
  background-color: #2e7d32;
  font-weight: bold;
}

main {
  min-height: 60vh;
  margin-bottom: 20px;
}

footer {
  text-align: center;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
  margin-top: 20px;
}

/* Responsieve aanpassingen */
@media (max-width: 768px) {
  header h1 {
    font-size: 1.8em;
  }
  
  nav {
    flex-direction: column;
    align-items: center;
  }
  
  nav button {
    width: 80%;
    margin: 5px 0;
  }
}
</style>
