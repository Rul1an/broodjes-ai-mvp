OpenAI heeft recent de Responses API geïntroduceerd, een nieuwe tool voor ontwikkelaars om geavanceerde AI-agenten te bouwen die complexe taken zelfstandig kunnen uitvoeren zonder directe menselijke tussenkomst. Deze API vervangt de eerdere Assistants API, die naar verwachting tegen medio 2026 wordt uitgefaseerd. ([reuters.com](https://www.reuters.com/technology/artificial-intelligence/openai-launches-new-developer-tools-chinese-ai-startups-gain-ground-2025-03-11/?utm_source=openai))

**Belangrijkste verschillen tussen de Responses API en de Assistants API:**

1. **Functieaanroep (Function Calling):** De Responses API biedt de mogelijkheid om functies te definiëren die de AI kan aanroepen. Ontwikkelaars kunnen functies beschrijven en de AI kan intelligent kiezen om een JSON-object te retourneren met de argumenten voor die functies. Dit maakt een betrouwbaardere koppeling mogelijk tussen de AI en externe tools of API's. ([automationinside.com](https://www.automationinside.com/article/function-calling-and-other-api-updates?utm_source=openai))

2. **Uitgebreide contextlengte:** Met de nieuwe API kunnen modellen zoals gpt-3.5-turbo-16k worden gebruikt, die een contextlengte van 16.000 tokens ondersteunen. Dit is vier keer de standaard 4.000 tokens, waardoor de AI grotere hoeveelheden tekst in één verzoek kan verwerken. ([automationinside.com](https://www.automationinside.com/article/function-calling-and-other-api-updates?utm_source=openai))

**Voorbeeld van functieaanroep met de Responses API:**

Stel dat u een chatbot wilt bouwen die het weerbericht kan ophalen. U kunt een functie definiëren genaamd `get_current_weather` en deze beschrijven in de API-aanroep.


```json
{
  "model": "gpt-3.5-turbo-0613",
  "messages": [
    {"role": "system", "content": "Je bent een behulpzame assistent."},
    {"role": "user", "content": "Wat is het weer in Amsterdam?"}
  ],
  "functions": [
    {
      "name": "get_current_weather",
      "description": "Haal het huidige weer op voor een specifieke locatie.",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "De stad en het land, bijvoorbeeld 'Amsterdam, Nederland'."
          },
          "unit": {
            "type": "string",
            "enum": ["celsius", "fahrenheit"],
            "description": "De temperatuureenheid."
          }
        },
        "required": ["location", "unit"]
      }
    }
  ]
}
```


In dit voorbeeld zal de AI, wanneer de gebruiker vraagt naar het weer in Amsterdam, een JSON-object retourneren met de benodigde parameters voor de functie `get_current_weather`. Uw applicatie kan deze functie vervolgens aanroepen met de opgegeven parameters om het actuele weer op te halen en het resultaat terugsturen naar de AI voor verdere verwerking.

Deze verbeteringen in de Responses API stellen ontwikkelaars in staat om krachtigere en meer geïntegreerde AI-toepassingen te bouwen, met een grotere context en de mogelijkheid om externe functies betrouwbaar aan te roepen. 