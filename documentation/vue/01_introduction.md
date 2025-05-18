# Vue.js 3 Introductie (Samenvatting)

Vue (uitgesproken als /vjuː/, zoals "view") is een JavaScript-framework voor het bouwen van gebruikersinterfaces (UI's). Het bouwt voort op standaard HTML, CSS en JavaScript en biedt een declaratief, componentgebaseerd programmeermodel dat helpt bij het efficiënt ontwikkelen van zowel eenvoudige als complexe UI's.

**Kernconcepten:**

*   **Declarative Rendering:** Vue breidt HTML uit met een template-syntaxis waarmee je op declaratieve wijze kunt beschrijven hoe HTML eruit moet zien op basis van JavaScript-staat.
*   **Reactivity:** Vue houdt automatisch veranderingen in JavaScript-staat bij en werkt efficiënt het Document Object Model (DOM) bij wanneer die staat verandert.
*   **Component-Based:** Grote applicaties kunnen worden opgesplitst in kleinere, zelfstandige en herbruikbare componenten. Elke component heeft zijn eigen HTML-template, JavaScript-logica en CSS-stijlen.
*   **Progressive Framework:** Vue is ontworpen om incrementeel adopteerbaar te zijn. Je kunt Vue gebruiken om slechts een deel van een bestaande pagina te verbeteren, of je kunt het gebruiken om een volledige Single-Page Application (SPA) te bouwen.
*   **Single-File Components (SFCs):** Met een build-stap (zoals Vite of Vue CLI) kun je componenten schrijven in `.vue` bestanden. Deze bestanden bundelen de HTML-template, JavaScript-logica en CSS van een component op een overzichtelijke manier.

**Twee API Stijlen:**

Vue biedt twee stijlen voor het schrijven van componentlogica:

1.  **Options API:** Logica wordt georganiseerd per optie (bijv. `data`, `methods`, `mounted`). Dit is de oorspronkelijke API en kan voor beginners wat makkelijker te overzien zijn.
2.  **Composition API:** Logica wordt georganiseerd per logische zorg (feature) met behulp van importeerde functies. Dit biedt meer flexibiliteit en herbruikbaarheid, vooral in grotere applicaties. Het wordt vaak gebruikt met `<script setup>` in SFCs voor beknoptere code.

Beide API-stijlen kunnen de volledige kracht van Vue benutten en kunnen zelfs gemixt worden.

**Ecosysteem:**

Vue heeft een rijk ecosysteem, inclusief:

*   **Officiële router:** `vue-router` voor het bouwen van SPAs met client-side routing.
*   **State management bibliotheek:** `pinia` (de aanbevolen, lichtgewicht oplossing) of `vuex` (voorheen de standaard, robuuster voor complexe state).
*   **Build tooling:** Vite is de moderne, snelle build tool voor Vue projecten. Vue CLI is een oudere, maar nog steeds ondersteunde optie.
*   **Devtools:** Browser extensie voor het debuggen van Vue applicaties.

**Voor wie is deze documentatie?**

Deze documentatie veronderstelt een gemiddeld niveau van kennis van HTML, CSS en JavaScript. Als je helemaal nieuw bent in frontend-ontwikkeling, is het wellicht beter om eerst de basis van deze technologieën te leren voordat je in een framework duikt.

*Bron: Gebaseerd op de officiële Vue.js 3 documentatie (vuejs.org/guide/introduction.html)*
