function getRefinePrompt(originalRecipeJsonString, existingBreakdownText, trimmedRefinementRequest) {
    // HIER KOMT DE GROTE PROMPT STRING
    return `
        Origineel Recept (JSON formaat):
        --- START RECEPT ---
        ${originalRecipeJsonString}
        --- EINDE RECEPT ---

        Bestaande Kosten Opbouw:
        --- START KOSTEN ---
        ${existingBreakdownText}
        --- EINDE KOSTEN ---

        Verzoek Gebruiker: "${trimmedRefinementRequest}"

        Taak: Pas het originele recept aan volgens het verzoek van de gebruiker. Pas OOK de kosten opbouw aan zodat deze overeenkomt met het *aangepaste* recept. Geef het volledige, bijgewerkte recept EN de bijgewerkte kostenopbouw terug als één stuk platte tekst. Gebruik de volgende Markdown-achtige opmaak voor het GEHELE antwoord:

        # [Nieuwe Recept Titel]

        [Optionele korte beschrijving]

        ## Ingrediënten:
        - [Hoeveelheid] [Ingrediënt 1]
        - ...

        ## Bereiding:
        1. [Stap 1]
        - ...

        ## Geschatte Tijd:
        - [Tijd]

        ## Geschatte Kosten Opbouw:
        - [Ingrediënt A] ([Hoeveelheid]): €X.XX
        - [Ingrediënt B] ([Hoeveelheid]): €Y.YY
        - ...
        - **Totaal Geschat:** €Z.ZZ

        BELANGRIJK: Geef GEEN extra uitleg, GEEN inleidende zinnen, GEEN afsluitende zinnen. Geef alleen het bijgewerkte recept en de bijgewerkte kostenopbouw in de gevraagde platte tekst opmaak.
        `;
}

module.exports = { getRefinePrompt };
