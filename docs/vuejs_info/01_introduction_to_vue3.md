# Inleiding tot Vue.js 3

## Wat is Vue?

Vue (uitgesproken als /vjuː/, zoals **view**) is een JavaScript-framework voor het bouwen van gebruikersinterfaces. Het bouwt voort op standaard HTML, CSS en JavaScript en biedt een declaratief, componentgebaseerd programmeermodel dat je helpt efficiënt gebruikersinterfaces van elke complexiteit te ontwikkelen.

**Kernfuncties:**
*   **Declarative Rendering**: Vue breidt standaard HTML uit met een template-syntaxis waarmee je HTML-output declaratief kunt beschrijven op basis van JavaScript-staat.
*   **Reactivity**: Vue volgt automatisch JavaScript-staatswijzigingen en werkt de DOM efficiënt bij wanneer wijzigingen optreden.

## Het Progressieve Framework

Vue is ontworpen om flexibel en incrementeel adopteerbaar te zijn. Afhankelijk van je use case kan Vue op verschillende manieren worden gebruikt:
*   Statische HTML verbeteren zonder een build-stap.
*   Insluiten als Web Components op elke pagina.
*   Single-Page Application (SPA).
*   Fullstack / Server-Side Rendering (SSR).
*   Jamstack / Static Site Generation (SSG).
*   Targeting van desktop, mobiel, WebGL, en zelfs de terminal.

Vue wordt "Het Progressieve Framework" genoemd omdat het een framework is dat met je mee kan groeien en zich aan je behoeften kan aanpassen.

## Single-File Components (SFCs)

In de meeste Vue-projecten met build-tools worden Vue-componenten geschreven met een HTML-achtig bestandsformaat genaamd **Single-File Component** (ook bekend als `*.vue` bestanden, afgekort als **SFC**). Een Vue SFC kapselt de logica (JavaScript), template (HTML), en stijlen (CSS) van de component in één enkel bestand.

Voorbeeld SFC:
```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <button @click="count++">Count is: {{ count }}</button>
</template>

<style scoped>
button {
  font-weight: bold;
}
</style>
```
SFC is een bepalende functie van Vue en de aanbevolen manier om Vue-componenten te schrijven als je use case een build-setup rechtvaardigt.

## API Styles

Vue-componenten kunnen in twee verschillende API-stijlen worden geschreven: **Options API** en **Composition API**.

### Options API
Met Options API definieer je de logica van een component met een object van opties zoals `data`, `methods`, en `mounted`. Eigenschappen gedefinieerd door opties worden blootgesteld op `this` binnen functies, wat verwijst naar de componentinstantie.

```vue
<script>
export default {
  data() {
    return {
      count: 0
    }
  },
  methods: {
    increment() {
      this.count++
    }
  },
  mounted() {
    console.log(`The initial count is ${this.count}.`)
  }
}
</script>

<template>
  <button @click="increment">Count is: {{ count }}</button>
</template>
```

### Composition API
Met Composition API definieer je de logica van een component met geïmporteerde API-functies. In SFCs wordt Composition API meestal gebruikt met `<script setup>`. Dit maakt het mogelijk om Composition API met minder boilerplate te gebruiken. Importeringen en top-level variabelen/functies gedeclareerd in `<script setup>` zijn direct bruikbaar in de template.

```vue
<script setup>
import { ref, onMounted } from 'vue'

// reactive state
const count = ref(0)

// functions that mutate state and trigger updates
function increment() {
  count.value++
}

// lifecycle hooks
onMounted(() => {
  console.log(`The initial count is ${count.value}.`)
})
</script>

<template>
  <button @click="increment">Count is: {{ count }}</button>
</template>
```

**Welke te kiezen?**
Beide API-stijlen zijn volledig in staat om gangbare use cases te dekken.
*   **Options API** is meer beginnersvriendelijk en sluit beter aan bij een klasse-gebaseerd mentaal model.
*   **Composition API** is flexibeler en maakt krachtigere patronen mogelijk voor het organiseren en hergebruiken van logica, vooral in grotere applicaties. Het wordt aanbevolen voor volledige applicaties met Vue.

Voor leerdoeleinden, kies de stijl die je makkelijker te begrijpen vindt. De kernconcepten zijn gedeeld.
Voor productie:
*   **Options API** als je geen build tools gebruikt of Vue voornamelijk in laag-complexe scenario's gebruikt.
*   **Composition API + SFCs** als je van plan bent volledige applicaties met Vue te bouwen.

*Bron: Vue.js Officiële Documentatie (vuejs.org/guide/introduction)*
