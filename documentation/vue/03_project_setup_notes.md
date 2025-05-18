# Vue.js Project Setup Notities (Broodjes AI App)

Dit document bevat specifieke notities voor de integratie en setup van Vue.js binnen de "Broodjes AI App", rekening houdend met de bestaande Netlify configuratie.

**1. Keuze voor Vue.js:**

*   Gezien de `netlify.toml` al configuraties bevat voor een Vue-applicatie (onder `broodjes-app-vue`) en Vite, is Vue.js een logische keuze.
*   Vue.js biedt een goede balans tussen eenvoud, performance en een rijk ecosysteem.
*   De progressieve adoptie maakt het mogelijk om eventueel delen van de bestaande frontend stapsgewijs te vervangen.

**2. Projectstructuur en `netlify.toml`:**

De huidige `netlify.toml` specificeert het volgende voor de build:

```toml
[build]
  command = "npm run build"
  base    = "broodjes-app-vue" # Vue app code hier
  publish = "dist"             # Gebouwde bestanden komen hier (output van Vite)
  functions = "netlify/functions"

[dev]
  command = "npm run dev"      # Start Vite dev server
  targetPort = 5173          # Vite dev server poort
  framework = "#vite"
  functions = "netlify/functions"
```

*   **`base = "broodjes-app-vue"`**: Dit betekent dat onze Vue.js-applicatiecode in een submap genaamd `broodjes-app-vue` in de root van de repository moet komen.
*   **`publish = "dist"`**: Na het uitvoeren van `npm run build` (binnen de `broodjes-app-vue` map), zal Vite de productiebestanden in een `dist` map plaatsen (dus `broodjes-app-vue/dist`). Netlify zal deze map deployen.
*   **`command = "npm run build"` / `"npm run dev"`**: Deze scripts moeten gedefinieerd zijn in de `package.json` van de `broodjes-app-vue` applicatie.
    *   `npm run dev` zal typisch `vite` starten.
    *   `npm run build` zal typisch `vite build` uitvoeren.
*   **`targetPort = 5173`**: Netlify Dev zal proberen te proxyen naar deze poort waar de Vite dev server draait.
*   **Redirects**: De `netlify.toml` bevat al redirects voor API calls (`/api/*` naar Netlify functions) en een SPA fallback (`/*` naar `index.html`). Deze zijn belangrijk voor een Vue app met `vue-router`.

**3. Stappen voor Implementatie:**

1.  **Initialiseer Vue Project in `broodjes-app-vue`:**
    *   Als de map `broodjes-app-vue` nog niet bestaat of leeg is, maak deze aan.
    *   Navigeer naar de `broodjes-app-vue` map in de terminal.
    *   Gebruik `npm init vue@latest` om een nieuw Vue.js project te initialiseren (zoals beschreven in de Quick Start guide).
        *   Kies tijdens de setup voor opties zoals Vue Router (voor navigatie) en Pinia (voor state management) als dat wenselijk is voor de app.
        *   Zorg ervoor dat ESLint en Prettier worden geconfigureerd voor codekwaliteit.

2.  **Verplaats Bestaande Frontend Logica (Indien Nodig):**
    *   De huidige HTML (`index.html`), CSS (`style.css`), en JavaScript (`*.js` in `frontend/js`) moeten worden geherstructureerd naar Vue componenten binnen de `broodjes-app-vue/src` map.
    *   HTML-structuren worden templates binnen `.vue` bestanden.
    *   JavaScript logica wordt onderdeel van de `<script setup>` (of Options API) in `.vue` componenten.
    *   CSS kan globaal (`src/assets/main.css`), per component (`<style scoped>`), of via CSS modules worden georganiseerd.

3.  **Configuratie `vite.config.js`:**
    *   Controleer de `vite.config.js` in de `broodjes-app-vue` map.
    *   Mogelijk zijn er aanpassingen nodig voor proxy-instellingen als de API calls niet via de Netlify Dev proxy maar direct vanuit Vite naar de Netlify functions (poort 8888 standaard) moeten lopen tijdens de dev-fase, hoewel de `[[redirects]]` in `netlify.toml` dit meestal afhandelt.

4.  **`package.json` in `broodjes-app-vue`:**
    *   Zorg dat de `scripts` sectie `"dev": "vite"` en `"build": "vite build"` bevat.
    *   Voeg eventuele andere benodigde dependencies toe (bijv. `axios` voor API calls, `pinia`, `vue-router`).

5.  **Hoofd `package.json` (Root):**
    *   De `package.json` in de root van het project kan scripts bevatten om de `netlify dev` server te starten of om de build voor de Vue app te triggeren als onderdeel van een algemenere build-stap, hoewel Netlify dit meestal per `base` directory afhandelt.

**4. Belangrijke Overwegingen:**

*   **State Management:** Voor een applicatie als de Broodjes AI App zal state management (bijv. met Pinia) waarschijnlijk nodig zijn om de staat van recepten, gebruikersinvoer, laadstatussen, etc. te beheren.
*   **Routing:** Als de app meerdere "pagina's" of views krijgt (bijv. een view voor het genereren, een view voor opgeslagen recepten), is `vue-router` essentieel.
*   **API Calls:** Bestaande API call logica (naar Netlify functions) moet worden geïntegreerd in de Vue componenten, mogelijk via een dedicated service/composable.
*   **Styling:** Overweeg een CSS-framework (zoals Tailwind CSS, BootstrapVue) of een consistente styling aanpak.

Door deze stappen en overwegingen te volgen, kan Vue.js succesvol worden geïntegreerd in de "Broodjes AI App", gebruikmakend van de bestaande Netlify setup.
