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

<script setup>
import { ref } from 'vue';
import GenerateView from './components/GenerateView.vue';
import RecipeListView from './components/RecipeListView.vue';
import ImageModal from './components/ImageModal.vue'; // Importeren van de modal

const activeTab = ref('generate'); // Default tab

// Data voor de modal
const showModal = ref(false);
const modalImageUrl = ref('');
const modalTitle = ref('');

// Globale functie om modal te tonen (kan worden aangeroepen vanuit child components via events of een store)
// Voor nu houden we het simpel. Een betere aanpak zou via provide/inject of Pinia zijn.
window.displayGlobalModal = (imageUrl, title) => {
  modalImageUrl.value = imageUrl;
  modalTitle.value = title;
  showModal.value = true;
};

</script>

<style>
/* Globale stijlen kunnen hier komen, of in een apart CSS-bestand geimporteerd in main.js */
body {
  font-family: sans-serif;
  margin: 0;
  background-color: #f4f4f4;
  color: #333;
}

#app-container {
  max-width: 800px;
  margin: 20px auto;
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(0,0,0,0.1);
}

header {
  text-align: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

header h1 {
  margin: 0 0 10px 0;
}

nav button {
  padding: 10px 15px;
  margin: 0 5px;
  border: 1px solid #ccc;
  background-color: #f9f9f9;
  cursor: pointer;
  border-radius: 4px;
}

nav button.active {
  background-color: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

main {
  padding: 10px 0;
}

footer {
  text-align: center;
  margin-top: 30px;
  padding-top: 15px;
  border-top: 1px solid #eee;
  font-size: 0.9em;
  color: #777;
}
</style>
