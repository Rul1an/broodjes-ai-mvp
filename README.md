# Broodjes AI MVP

Dit is een Minimum Viable Product (MVP) voor een applicatie die AI (OpenAI GPT) gebruikt om broodjesrecepten te genereren.

## Lokale Setup

1.  **Clone de repository** (of zorg dat je alle bestanden hebt).

2.  **Backend Setup (voor lokale ontwikkeling):**
    *   Navigeer naar de `backend` map:
        ```bash
        cd backend
        ```
    *   Maak een virtuele omgeving (aanbevolen):
        ```bash
        python -m venv venv
        source venv/bin/activate  # Op Windows: venv\Scripts\activate
        ```
    *   Installeer de benodigde Python packages:
        ```bash
        pip install -r requirements.txt
        ```
    *   Maak een `.env` bestand in de `backend` map. Kopieer de inhoud van `.env.example` (als die bestaat) of voeg de volgende regel toe en vervang de placeholder met je daadwerkelijke OpenAI API key:
        ```
        OPENAI_API_KEY='jouw_openai_api_key_hier'
        ```
        **BELANGRIJK:** Voeg `.env` toe aan je `.gitignore` bestand als je dit project met Git beheert om te voorkomen dat je je API key per ongeluk publiceert.

3.  **Frontend Setup:**
    *   Er is geen speciale setup nodig voor de frontend, behalve het openen van het `index.html` bestand.

## Lokaal Draaien

1.  **Start de Backend:**
    *   Zorg dat je in de `backend` map bent en dat je virtuele omgeving geactiveerd is.
    *   Start de Flask server:
        ```bash
        python app.py
        ```
    *   De backend draait nu standaard op `http://127.0.0.1:5001`.

2.  **Open de Frontend:**
    *   Navigeer naar de `frontend` map.
    *   Open het `index.html` bestand in je web browser (dubbelklikken zou moeten werken).

3.  **Gebruik:**
    *   Voer een broodjesidee in (bv. "Broodje gerookte zalm met roomkaas en dille").
    *   Klik op "Genereer Recept".
    *   Wacht even tot het recept verschijnt.

## Deployment op Netlify (Aanbevolen voor Hosting)

Je kunt deze app eenvoudig en gratis hosten op Netlify, waarbij de frontend statisch gehost wordt en de API-aanroepen gebeuren via een serverless function:

1. **Lokaal testen met Netlify CLI:**
   ```bash
   npm install              # Installeer dependencies
   npm install -g netlify-cli # Installeer Netlify CLI
   netlify login            # Log in op je Netlify account
   netlify dev              # Start lokale ontwikkelomgeving
   ```

2. **Site Deployment:**
   * Fork/Clone dit project naar je eigen GitHub repository.
   * Ga naar [Netlify](https://app.netlify.com/) en maak een nieuw account aan als je die nog niet hebt.
   * Klik op "New site from Git" en kies je GitHub repository.
   * Verifieer dat de build-instellingen overeenkomen met de instellingen in `netlify.toml`:
     * Build command: (leeg laten of eventueel `npm run build` als je build-stappen toevoegt)
     * Publish directory: `frontend`
   * In "Advanced build settings", voeg je OpenAI API key toe als omgevingsvariabele:
     * Key: `OPENAI_API_KEY`
     * Value: [jouw OpenAI API key]
   * Klik op "Deploy site".

3. **Na de Deployment:**
   * Je app is nu live op de URL die Netlify je geeft (bv. `https://jouw-app-naam.netlify.app`).
   * De frontend communiceert met de serverless function op `/api/generate`, die op zijn beurt communiceert met de OpenAI API.
   * Je API key is veilig opgeslagen als environment variable in Netlify, niet zichtbaar in de frontend code.