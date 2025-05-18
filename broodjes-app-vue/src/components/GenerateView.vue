<template>
  <div class="generate-view">
    <h2>Genereer Broodje</h2>

    <form @submit.prevent="handleGenerate" class="generate-form">
      <div class="form-group">
        <label for="thema">Thema (optioneel):</label>
        <input type="text" id="thema" v-model="thema">
      </div>

      <div class="form-group">
        <label for="extraIngredienten">Extra ingrediënten (optioneel):</label>
        <input type="text" id="extraIngredienten" v-model="extraIngredienten">
      </div>

      <div class="form-group">
        <label for="stijl">Stijl/sfeer (optioneel):</label>
        <input type="text" id="stijl" v-model="stijl">
      </div>

      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Genereren...' : 'Genereer Broodje' }}
      </button>
    </form>

    <!-- Toon foutmelding indien aanwezig -->
    <div v-if="error" class="error-message">
      <strong>Fout:</strong> {{ error.message || error }}
      <pre v-if="error.details">{{ error.details }}</pre>
    </div>
     <div v-if="pollingError" class="error-message">
      <strong>Fout bij visualisatie:</strong> {{ pollingError.message || pollingError }}
      <pre v-if="pollingError.details">{{ pollingError.details }}</pre>
    </div>

    <!-- Resultaat sectie -->
    <div v-if="generatedRecipe" class="result-area">
      <h3>Gegenereerd Recept:</h3>
      <div v-html="formattedRecipe"></div> <!-- Gebruik v-html om markdown te renderen -->

      <div class="visualize-area">
        <button @click="handleVisualize" v-if="!isVisualizing && !imageUrl" :disabled="isPolling">
          Visualiseer Broodje
        </button>
        <span v-if="isVisualizing">Visualisatie starten...</span>
         <span v-if="isPolling">Bezig met visualiseren (polling)...</span>

         <!-- Toon afbeelding als URL beschikbaar is -->
         <div v-if="imageUrl" class="image-result">
            <h4>Visualisatie:</h4>
            <img :src="imageUrl" alt="Visualisatie van het broodje" />
            <button @click="resetVisualization">Nieuwe visualisatie?</button> <!-- Optioneel -->
         </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'; // Importeer ook onUnmounted
import { marked } from 'marked';
import apiService from '@/services/apiService.js'; // Importeer de service (pas pad aan indien nodig)

// --- Reactive State ---
const thema = ref('');
const extraIngredienten = ref('');
const stijl = ref('');

const isLoading = ref(false); // Voor genereren knop
const error = ref(null); // Algemene/generatie fouten
const pollingError = ref(null); // Fouten specifiek tijdens pollen
const generatedRecipe = ref(null);
const currentTaskId = ref(null);
const currentRecipeTitle = ref('');

const isVisualizing = ref(false); // Voor starten visualisatie
const isPolling = ref(false);     // Voor status checken
const imageUrl = ref(null);       // URL van de uiteindelijke afbeelding
let pollingIntervalId = null;     // ID om interval te stoppen

// --- Computed Properties ---
const formattedRecipe = computed(() => {
  if (generatedRecipe.value?.markdown_recipe_string) {
    // Optioneel: configure marked (als je specifieke opties nodig hebt)
    // marked.setOptions({ gfm: true, breaks: true });
    return marked.parse(generatedRecipe.value.markdown_recipe_string);
  }
  return '';
});

// --- Methods ---

// Reset state before generating new recipe
function resetState() {
    isLoading.value = false;
    error.value = null;
    pollingError.value = null;
    generatedRecipe.value = null;
    currentTaskId.value = null;
    currentRecipeTitle.value = '';
    isVisualizing.value = false;
    isPolling.value = false;
    imageUrl.value = null;
    stopPolling(); // Zorg dat een eventuele oude poll stopt
}

const handleGenerate = async () => {
  resetState(); // Reset alles voor een nieuwe generatie
  isLoading.value = true;

  try {
    const response = await apiService.generateRecipe({
      theme: thema.value,
      extra_ingredients: extraIngredienten.value,
      style: stijl.value
    });

    // Verwerk de succesvolle response van /api/generate
    // Pas dit aan op basis van de daadwerkelijke structuur die je Netlify functie teruggeeft
    if (response && response.recipe && response.taskId) {
        generatedRecipe.value = response.recipe;
        currentTaskId.value = response.taskId;
        currentRecipeTitle.value = response.recipe.title || 'Broodje Recept'; // Fallback titel
        console.log('Recept gegenereerd:', response);
    } else {
         console.error("Ongeldige response van generate API:", response);
        throw new Error('Kon het recept niet correct verwerken na generatie.');
    }

  } catch (err) {
    console.error('Fout bij genereren:', err);
    // Gebruik de message van het gestructureerde error object
    error.value = err || { message: 'Onbekende fout bij genereren.' };
  } finally {
    isLoading.value = false;
  }
};

const handleVisualize = async () => {
  if (!currentTaskId.value) {
    error.value = { message: 'Geen geldig recept ID gevonden voor visualisatie.' };
    return;
  }

  // Reset visualisatie state
  isVisualizing.value = true;
  isPolling.value = false;
  pollingError.value = null;
  imageUrl.value = null;
  stopPolling(); // Stop eventuele vorige poll

  try {
    console.log(`Start visualisatie aanvraag voor task ID: ${currentTaskId.value}`);
    // Roep de Netlify functie aan die de GCF start
    const startResponse = await apiService.visualizeRecipe(currentTaskId.value);
    console.log('Visualisatie gestart response:', startResponse);

    // Begin met pollen als het starten succesvol was
    // Check de response van je /api/visualize functie hier eventueel
    if (startResponse) { // Aanname: succesvolle response betekent dat we kunnen pollen
        startPolling();
    } else {
        throw new Error("Starten van visualisatie mislukt of gaf onverwachte response.");
    }

  } catch (err) {
    console.error('Fout bij starten visualisatie:', err);
    pollingError.value = err || { message: 'Onbekende fout bij starten visualisatie.' };
    isVisualizing.value = false; // Stop laad indicator
  } finally {
     // isLoading (starten) klaar, maar isPolling kan nu true zijn
     isVisualizing.value = false;
  }
};

// Functie om te pollen voor de status
const pollStatus = async () => {
    if (!currentTaskId.value) {
        console.error("Polling gestopt: Geen Task ID.");
        stopPolling();
        return;
    }
    console.log(`Polling status voor task ID: ${currentTaskId.value}...`);

    try {
        const statusResponse = await apiService.getTaskStatus(currentTaskId.value);
        console.log('Poll status response:', statusResponse);

        // Verwerk de status response
        // Pas de status strings ('completed', 'failed', 'pending') aan indien nodig
        if (statusResponse?.status === 'completed') {
            console.log('Visualisatie voltooid!');
            if (statusResponse.imageUrl) {
                 // Construct full URL if only relative path is returned? Depends on API.
                 // Voor nu gaan we uit van een volledige URL.
                imageUrl.value = statusResponse.imageUrl;
            } else {
                 throw new Error("Taak voltooid, maar geen image URL ontvangen.");
            }
            stopPolling();
        } else if (statusResponse?.status === 'failed') {
            console.error('Visualisatie taak mislukt:', statusResponse.error);
            throw new Error(statusResponse.error || 'Visualisatie taak mislukt zonder specifieke reden.');
        } else if (statusResponse?.status === 'pending') {
            // Taak loopt nog, blijf pollen (interval doet dit automatisch)
            console.log('Visualisatie nog bezig...');
        } else {
            // Onverwachte status
             console.warn("Onbekende of ontbrekende status ontvangen:", statusResponse);
             // Optioneel: stop pollen bij onbekende status?
             // throw new Error(`Onbekende taakstatus ontvangen: ${statusResponse?.status}`);
        }
    } catch (err) {
        console.error('Fout tijdens pollen:', err);
        pollingError.value = err || { message: 'Onbekende fout tijdens pollen.' };
        stopPolling(); // Stop met pollen bij een fout
    }
}

// Start het pollen interval
const startPolling = () => {
    stopPolling(); // Zorg dat er niet meerdere intervals lopen
    isPolling.value = true; // Update UI state
    pollingError.value = null; // Reset error

    // Poll direct 1x, en daarna elke 3 seconden (bijvoorbeeld)
    pollStatus();
    pollingIntervalId = setInterval(pollStatus, 3000); // Pas interval aan indien nodig
}

// Stop het pollen interval
const stopPolling = () => {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        console.log('Polling gestopt.');
    }
    // Reset polling state pas als het echt klaar is (of gefaald)
    // isPolling.value = false; -> wordt afgehandeld in pollStatus
}

// Optionele functie om visualisatie te resetten
const resetVisualization = () => {
    imageUrl.value = null;
    isPolling.value = false; // Zorg dat polling stopt als we resetten
    pollingError.value = null;
    stopPolling();
}

// --- Lifecycle Hooks ---
// Zorg dat polling stopt als het component wordt vernietigd
onUnmounted(() => {
  stopPolling();
});

</script>

<style scoped>
/* Stijlen blijven grotendeels hetzelfde, voeg eventueel styling toe voor .image-result */
.generate-view {
  padding: 15px;
}

.generate-form .form-group {
  margin-bottom: 15px;
}

.generate-form label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.generate-form input[type="text"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.generate-form button {
  padding: 10px 15px;
  background-color: #42b983; /* Vue green */
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
  transition: background-color 0.3s;
}

.generate-form button:disabled {
  background-color: #aaa;
  cursor: not-allowed;
}

.generate-form button:not(:disabled):hover {
  background-color: #36a46e;
}

.error-message {
  margin-top: 15px;
  color: red;
  border: 1px solid red;
  padding: 10px;
  border-radius: 4px;
  background-color: #ffebeb;
  white-space: pre-wrap; /* Behoud newlines in details */
}

.result-area {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #f9f9f9;
}

.result-area h3 {
  margin-top: 0;
  color: #42b983;
}

.visualize-area {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #ccc;
}

.visualize-area button {
   padding: 8px 12px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background-color 0.3s;
  margin-right: 10px; /* Ruimte tussen knoppen */
}
.visualize-area button:disabled {
  background-color: #aaa;
  cursor: not-allowed;
}

.visualize-area button:hover:not(:disabled) {
  background-color: #0056b3;
}

.visualize-area span {
    font-style: italic;
    color: #555;
}

.image-result {
    margin-top: 15px;
}
.image-result img {
    max-width: 100%;
    height: auto;
    border: 1px solid #ddd;
    margin-bottom: 10px;
}

</style>
