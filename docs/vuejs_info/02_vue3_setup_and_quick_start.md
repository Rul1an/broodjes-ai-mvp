# Vue.js 3 Setup en Quick Start

## Vue Online Proberen

Voordat je lokaal iets installeert, kun je Vue.js direct online uitproberen:
*   **Playground**: De officiële Vue Playground ([play.vuejs.org](https://play.vuejs.org/)) is ideaal om snel de werking van Vue te ervaren.
*   **JSFiddle**: Voor een simpele HTML-setup zonder build-stappen, kun je een JSFiddle-template gebruiken ([link via vuejs.org](https://vuejs.org/guide/quick-start.html#try-vue-online)).
*   **StackBlitz**: Voor een volledige build-setup direct in je browser, inclusief SFC's.

## Een Vue Applicatie Lokaal Creëren (met Vite)

Voor het ontwikkelen van Single Page Applications (SPA's) met Vue Single-File Components (SFC's), wordt een build-setup aanbevolen. De officiële manier om een Vue-project op te zetten is via `create-vue`, gebaseerd op Vite.

**Vereisten:**
*   Bekendheid met de command line.
*   Node.js versie 18.3 of hoger geïnstalleerd.

**Stappen:**
1.  Open je terminal en navigeer naar de map waar je het project wilt aanmaken.
2.  Voer het volgende commando uit:
    ```bash
    npm create vue@latest
    ```
    (Je kunt ook `pnpm create vue@latest` of `yarn create vue` gebruiken.)

3.  Dit commando installeert en voert `create-vue` uit. Je krijgt een aantal vragen over optionele features zoals TypeScript, JSX-ondersteuning, Vue Router, Pinia (voor state management), test-tools (Vitest, Playwright, Cypress), ESLint, en Prettier.
    *   Kies 'No' als je onzeker bent over een optie; je kunt deze later altijd toevoegen.

4.  Nadat het project is aangemaakt, volg je de instructies in de terminal:
    ```bash
    cd <your-project-name>
    npm install
    npm run dev
    ```
    Je Vue-project draait nu lokaal, meestal op `http://localhost:5173`.

**Aanbevolen IDE Setup:**
*   Visual Studio Code + Vue - Official extension (voorheen Volar).

## Vue Gebruiken vanaf een CDN (zonder build-stap)

Je kunt Vue ook direct vanaf een CDN gebruiken via een `<script>` tag. Dit is geschikt voor het verbeteren van statische HTML of integratie met een backend framework, maar je kunt geen SFC-syntax gebruiken.

**Voorbeeld (Global Build):**
```html
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>

<div id="app">{{ message }}</div>

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
```

**Voorbeeld (ES Module Build met Import Maps):**
Moderne browsers ondersteunen ES modules native.
```html
<script type="importmap">
  {
    "imports": {
      "vue": "https://unpkg.com/vue@3/dist/vue.esm-browser.js"
    }
  }
</script>

<div id="app">{{ message }}</div>

<script type="module">
  import { createApp } from 'vue'

  createApp({
    data() {
      return {
        message: 'Hello Vue!'
      }
    }
  }).mount('#app')
</script>
```
**Belangrijk bij CDN-gebruik:**
*   De voorbeelden gebruiken de development build. Voor productie, gebruik de production build (zie Vue documentatie: Production Deployment).
*   ES modules werken alleen over het `http://` of `https://` protocol, niet `file://`. Gebruik een lokale HTTP-server (`npx serve`) als je lokaal met ES modules en aparte bestanden werkt.

*Bron: Vue.js Officiële Documentatie (vuejs.org/guide/quick-start.html)*
