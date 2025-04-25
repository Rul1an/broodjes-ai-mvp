# Broodjes AI MVP

Dit is een Minimum Viable Product (MVP) voor een applicatie die AI (OpenAI GPT) gebruikt om broodjesrecepten te genereren en deze opslaat in een Supabase database.

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
    *   Maak een `.env` bestand in de `backend` map. Kopieer de inhoud van `.env.example` (als die bestaat) of voeg de volgende regels toe en vervang de placeholders met je daadwerkelijke OpenAI API key en Supabase URL:
        ```
        OPENAI_API_KEY='jouw_openai_api_key'
        SUPABASE_URL='jouw_supabase_url'
        SUPABASE_ANON_KEY='jouw_supabase_anon_key'
        ```
        **BELANGRIJK:** Voeg `.env` toe aan je `.gitignore` bestand als je dit project met Git beheert om te voorkomen dat je je API keys per ongeluk publiceert.

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

Je kunt deze app eenvoudig en gratis hosten op Netlify, waarbij de frontend statisch gehost wordt en de API-aanroepen en database-interacties gebeuren via serverless functions:

1.  **Supabase Project Opzetten (Vereist):**
    *   Ga naar [Supabase](https://supabase.com/) en maak een gratis account aan.
    *   Maak een nieuw project aan.
    *   Ga naar de "SQL Editor" in je Supabase project dashboard.
    *   Voer het volgende SQL statement uit om de `recipes` tabel aan te maken:
        ```sql
        -- Tabel voor opgeslagen recepten
        CREATE TABLE recipes (
          id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          idea TEXT,
          generated_recipe TEXT,
          -- Voeg hier later kolommen toe voor geschatte/werkelijke kosten etc.
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        ```
    *   Voer **vervolgens** dit SQL statement uit om de `ingredients` tabel aan te maken:
        ```sql
        -- Tabel voor ingrediënten met prijzen
        CREATE TABLE ingredients (
            id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
            name TEXT NOT NULL UNIQUE, -- Ingredient naam (uniek)
            unit TEXT NOT NULL, -- Eenheid (bv. kg, liter, stuk, gram)
            price_per_unit NUMERIC(10, 4) NOT NULL, -- Prijs per eenheid (bv. 12.5000)
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Optioneel: Trigger om updated_at automatisch bij te werken
        CREATE OR REPLACE FUNCTION trigger_set_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER set_timestamp
        BEFORE UPDATE ON ingredients
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
        ```
    *   Ga naar "Project Settings" -> "API". Noteer je **Project URL** en je **anon public** API key. Deze heb je nodig voor Netlify.

2.  **Lokaal testen met Netlify CLI:**
    *   Zorg dat je de environment variables lokaal beschikbaar hebt (bv. via een `.env` bestand in de root, die in `.gitignore` staat!):
        ```
        OPENAI_API_KEY=jouw_openai_key
        SUPABASE_URL=jouw_supabase_url
        SUPABASE_ANON_KEY=jouw_supabase_anon_key
        ```
    *   Voer de commando's uit:
        ```bash
        npm install              # Installeer dependencies (incl. supabase-js)
        npm install -g netlify-cli # Installeer Netlify CLI (indien nog niet gedaan)
        netlify login            # Log in op je Netlify account
        netlify dev              # Start lokale ontwikkelomgeving (leest .env)
        ```

3.  **Site Deployment op Netlify:**
    *   Fork/Clone dit project naar je eigen GitHub repository (als je dat nog niet gedaan hebt).
    *   Ga naar [Netlify](https://app.netlify.com/) en maak een nieuw account aan als je die nog niet hebt.
    *   Klik op "New site from Git" en kies je GitHub repository.
    *   Verifieer dat de build-instellingen overeenkomen met de instellingen in `netlify.toml`:
        *   Build command: (leeg laten)
        *   Publish directory: `frontend`
    *   In "Advanced build settings", voeg **alle drie** de environment variables toe:
        *   Key: `OPENAI_API_KEY`, Value: [jouw OpenAI API key]
        *   Key: `SUPABASE_URL`, Value: [jouw Supabase Project URL]
        *   Key: `SUPABASE_ANON_KEY`, Value: [jouw Supabase anon public key]
    *   Klik op "Deploy site".

4.  **Na de Deployment:**
    *   Je app is nu live op de URL die Netlify je geeft.
    *   Nieuw gegenereerde recepten worden opgeslagen in je Supabase database en de lijst wordt bijgewerkt.
    *   API keys zijn veilig opgeslagen als environment variables in Netlify.
