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
      {{ error }}
    </div>

    <!-- Resultaat sectie -->
    <div v-if="generatedRecipe" class="result-area">
      <h3>Gegenereerd Recept:</h3>
      <div v-html="formattedRecipe"></div> <!-- Gebruik v-html om markdown te renderen -->
      <div class="visualize-area"> <!-- Later voor visualisatie knop -->
        <button @click="handleVisualize" v-if="!visualizing">Visualiseer Broodje</button>
        <span v-if="visualizing">Visualisatie bezig...</span>
        <!-- Hier komt later de modal trigger -->
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'; // Importeer ref en computed
import { marked } from 'marked';

// Reactieve referenties voor formulier velden
const thema = ref('');
const extraIngredienten = ref('');
const stijl = ref('');

// State voor laden, fouten en resultaten
const isLoading = ref(false);
const error = ref(null);
const generatedRecipe = ref(null); // Houdt het ruwe recept object vast
const currentTaskId = ref(null);   // Voor visualisatie
const currentRecipeTitle = ref(''); // Voor visualisatie

const visualizing = ref(false); // Voor visualisatie knop state

// Berekende eigenschap om markdown te formatteren
const formattedRecipe = computed(() => {
  if (generatedRecipe.value && generatedRecipe.value.markdown_recipe_string) {
    // Configure Marked (optioneel, voor GFM bijv.)
    // marked.setOptions({
    //   gfm: true,
    //   breaks: true,
    // });
    return marked.parse(generatedRecipe.value.markdown_recipe_string);
  }
  return '';
});

// Functie die wordt aangeroepen bij het submitten van het formulier
const handleGenerate = async () => {
  isLoading.value = true;
  error.value = null;
  generatedRecipe.value = null;
  currentTaskId.value = null;
  currentRecipeTitle.value = '';

  console.log('Start genereren met:', {
    theme: thema.value,
    extra_ingredients: extraIngredienten.value,
    style: stijl.value
  });

  try {
    // TODO: Implementeer API call naar backend (/api/generate)
    // Voor nu, simuleer een API call met dummy data na 2 seconden
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Dummy antwoord simulatie
    const dummyResponse = {
      success: true,
      recipe: {
        title: 'Gesimuleerd Zomer Broodje',
        markdown_recipe_string: `## Gesimuleerd Zomer Broodje\n\nEen heerlijk fris broodje voor de zomer!\n\n**Ingrediënten:**\n\n*   Broodje naar keuze\n*   Kipfilet (gegrild)\n*   Sla\n*   Komkommer\n*   Tomaat\n*   Yoghurtdressing\n*   ${extraIngredienten.value || 'Geen extra\'s'}\n\n**Bereiding:**\n\n1.  Snijd het broodje open.\n2.  Beleg met kipfilet, sla, komkommer en tomaat.\n3.  Voeg de yoghurtdressing toe.\n\n*Thema: ${thema.value || 'Algemeen'}*\n*Stijl: ${stijl.value || 'Normaal'}*`,
      },
      taskId: 'dummy-' + Date.now() // Simuleer een task ID
    };

    if (dummyResponse.success) {
      generatedRecipe.value = dummyResponse.recipe;
      currentTaskId.value = dummyResponse.taskId;
      currentRecipeTitle.value = dummyResponse.recipe.title;
      console.log('Recept ontvangen:', generatedRecipe.value);
      console.log('Task ID:', currentTaskId.value);
    } else {
      throw new Error(dummyResponse.message || 'Er is iets misgegaan bij het genereren.');
    }

  } catch (err) {
    console.error('Fout bij genereren:', err);
    error.value = err.message || 'Kon het recept niet genereren.';
  } finally {
    isLoading.value = false;
  }
};

// Functie voor visualisatie knop
const handleVisualize = async () => {
  if (!currentTaskId.value) {
    error.value = 'Geen geldig recept ID gevonden voor visualisatie.';
    return;
  }
  visualizing.value = true;
  error.value = null;
  console.log(`Start visualisatie voor task ID: ${currentTaskId.value}`);

  try {
    // TODO: Implementeer API call naar backend (/api/visualize/:taskId)
    // Voor nu, simuleer een succesvolle visualisatie na 1.5 sec
    await new Promise(resolve => setTimeout(resolve, 1500));
    const imageUrl = 'https://via.placeholder.com/400x300.png?text=Gesimuleerd+Broodje'; // Dummy URL
    console.log(`Visualisatie succesvol, image URL: ${imageUrl}`);

    // TODO: Roep showImageModal aan (uit uiUtils of een Vue equivalent)
    // showImageModal(imageUrl, `Visualisatie voor: ${currentRecipeTitle.value}`);
    alert(`Visualisatie klaar! (Image URL: ${imageUrl})\nModal moet nog geïmplementeerd worden.`);

  } catch (err) {
    console.error('Fout bij visualiseren:', err);
    error.value = err.message || 'Kon het broodje niet visualiseren.';
  } finally {
    visualizing.value = false;
  }
};

</script>

<style scoped>
.generate-view {
  padding: 15px;
  /* border: 1px solid #eee; */ /* Kan weg als App.vue al een border heeft */
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
  box-sizing: border-box; /* Voorkomt dat padding de width beïnvloedt */
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
}

.visualize-area button:hover {
  background-color: #0056b3;
}

</style>
