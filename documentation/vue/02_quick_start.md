# Vue.js 3 Quick Start (Samenvatting)

Deze guide helpt je snel op weg met Vue.js 3.

**1. Proberen zonder Build Stap (CDN):**

Je kunt Vue direct in een HTML-bestand gebruiken via een CDN. Dit is handig voor kleine projecten of om snel iets uit te proberen.

```html
<!DOCTYPE html>
<html>
<head>
  <title>Vue.js CDN Voorbeeld</title>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
</head>
<body>
  <div id="app">
    {{ message }}
  </div>

  <script>
    const { createApp } = Vue

    createApp({
      data() {
        return {
          message: 'Hello Vue!'
        }
      }
    }).mount('#app')
  </script>
</body>
</html>
```

*   De `vue.global.js` is de "full" build die zowel de compiler als de runtime bevat. Hierdoor kan Vue templates direct in de browser compileren.
*   `createApp({})` creëert een nieuwe Vue applicatie-instantie.
*   De `data` functie retourneert een object waarvan de eigenschappen reactief worden en beschikbaar zijn in de template.
*   `mount('#app')` koppelt de applicatie-instantie aan een DOM-element (hier met `id="app"`).

**2. Een Project Opzetten met Build Tools (Aanbevolen):**

Voor de meeste projecten, en zeker voor Single-Page Applications (SPAs), wordt een build-setup met [Vite](https://vitejs.dev/) aanbevolen. Vite biedt een extreem snelle ontwikkelervaring.

*   **Project Initialisatie (met `create-vue`):**
    De officiële manier om een Vite-powered Vue project te starten is via `create-vue`:
    ```bash
    npm init vue@latest
    ```
    Dit commando installeert en executeert `create-vue`, de officiële project scaffolding tool. Je krijgt vragen over optionele features zoals TypeScript, JSX, Vue Router, Pinia, Vitest (unit testing), Cypress/Playwright (E2E testing), ESLint, en Prettier.

*   **Projectstructuur (voorbeeld):**
    Een typisch `.vue` project met Vite heeft een structuur zoals:
    ```
    my-vue-app/
    ├── public/
    │   └── favicon.ico
    ├── src/
    │   ├── assets/
    │   │   └── logo.png
    │   ├── components/
    │   │   └── HelloWorld.vue
    │   ├── App.vue         # Hoofd App component
    │   └── main.js         # Applicatie entry point
    ├── index.html          # Entry HTML (wordt geserveerd door Vite dev server)
    ├── package.json
    ├── vite.config.js      # Vite configuratie
    └── README.md
    ```

*   **`main.js` (Entry Point):**
    ```javascript
    import { createApp } from 'vue'
    import App from './App.vue'
    import './assets/main.css' // Optionele globale CSS

    createApp(App).mount('#app')
    ```

*   **Single-File Components (SFCs - `.vue` bestanden):**
    SFCs zijn de kern van Vue applicaties met een build setup.
    ```vue
    <script setup>
    // JavaScript (Composition API met <script setup>)
    import { ref } from 'vue'
    const count = ref(0)
    </script>

    <template>
      <!-- HTML Template -->
      <button @click="count++">Count is: {{ count }}</button>
    </template>

    <style scoped>
    /* CSS (scoped tot deze component) */
    button {
      font-weight: bold;
    }
    </style>
    ```
    *   `<script setup>`: Gebruikt Composition API op een beknopte manier.
    *   `<template>`: De HTML-structuur van de component.
    *   `<style scoped>`: CSS die alleen van toepassing is op deze component.

*   **Ontwikkelserver Starten:**
    ```bash
    cd your-project-name
    npm install
    npm run dev
    ```

*   **Productie Build:**
    ```bash
    npm run build
    ```
    Dit creëert een geoptimaliseerde set van statische assets in de `dist` map.

**Wat is de Virtual DOM?**

Vue gebruikt een Virtual DOM (VDOM). Wanneer de staat van je componenten verandert, rendert Vue niet direct naar de echte DOM. In plaats daarvan wordt een nieuwe VDOM-boom gegenereerd en vergeleken ("diffed") met de vorige VDOM-boom. Alleen de noodzakelijke wijzigingen worden dan efficiënt toegepast op de echte DOM. Dit minimaliseert directe DOM-manipulaties, wat vaak een performance bottleneck is.

**API Stijlen:**

De Quick Start laat vaak voorbeelden zien met de Composition API en `<script setup>` omdat dit de aanbevolen aanpak is voor nieuwe projecten.

*Bron: Gebaseerd op de officiële Vue.js 3 documentatie (vuejs.org/guide/quick-start.html)*
