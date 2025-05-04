# OpenAI API Guide

## API Evolution at OpenAI

OpenAI's API landscape heeft zich in de loop der tijd ontwikkeld:

1. **Completions API** (Legacy): De oorspronkelijke API voor tekstgeneratie
2. **Chat Completions API**: Conversatie-interface met ondersteuning voor function calling
3. **Assistants API**: Uitgebreide API voor het bouwen van agents met ingebouwde tools en state management
4. **Responses API** (Nieuw): Combineert de eenvoud van Chat Completions met de kracht van Assistants

## Responses API: De Nieuwe Standaard

De Responses API is OpenAI's nieuwste API voor het bouwen van agent-achtige ervaringen. Het combineert de eenvoud van de Chat Completions API met de krachtige tool-gebruik en state management mogelijkheden van de Assistants API. De Responses API is ontworpen om:

- **Sneller**: Gestroomlijnd voor betere prestaties
- **Flexibeler**: Eenvoudiger aan te passen voor verschillende use cases
- **Gebruiksvriendelijker**: Vereenvoudigde interface met behoud van krachtige mogelijkheden

Uiteindelijk zal de Responses API de Assistants API vervangen, met geplande uitfasering van de Assistants API in 2026.

### Belangrijkste Kenmerken

#### Ingebouwde Tools

De Responses API introduceert verschillende krachtige ingebouwde tools:

1. **Web Search**: Stelt agents in staat om het web te doorzoeken voor real-time informatie
2. **File Search**: Stelt agents in staat om geüploade bestanden te doorzoeken en ernaar te verwijzen
3. **Computer Use**: Geeft agents de mogelijkheid om te interacteren met een virtuele computeromgeving

#### State Management

In tegenstelling tot de Chat Completions API behoudt de Responses API de status tussen interacties, vergelijkbaar met de Assistants API. Dit maakt het eenvoudiger om conversatie-agents te bouwen die context onthouden over meerdere beurten.

#### Vereenvoudigde Interface

De Responses API biedt een meer gestroomlijnde interface in vergelijking met de Assistants API, waardoor het gemakkelijker is om te beginnen terwijl het nog steeds krachtige mogelijkheden biedt.

## Gebruik van de Responses API

### Basis Gebruik

```python
import openai

# Initialiseer de OpenAI client
client = openai.OpenAI()

# Maak een response (correcte syntax)
response = client.responses.create(
    model="gpt-4o",
    input="Schrijf een kort gedicht over Amsterdam"
)

# Print de response (correcte output format)
print(response.output_text)
```

### Gebruik van Ingebouwde Tools

```python
import openai

# Initialiseer de OpenAI client
client = openai.OpenAI()

# Maak een response met web search ingeschakeld
response = client.responses.create(
    model="gpt-4o",
    tools=[{"type": "web_search_preview"}],  # Correcte syntax voor web search
    input=[
        {"role": "system", "content": "Je bent een behulpzame assistent."},
        {"role": "user", "content": "Wat zijn de laatste ontwikkelingen in AI?"}
    ]
)

# Print de response
print(response.output_text)
```

### Gebruik van Aangepaste Functies

```python
import openai
import json

# Definieer aangepaste functies
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Haal het huidige weer op voor een locatie",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "De stad, bijv. Amsterdam"
                    }
                },
                "required": ["location"]
            }
        }
    }
]

# Functie-implementatie
def get_weather(location):
    # In een echte applicatie zou dit een weer-API aanroepen
    return f"Het is 22°C en zonnig in {location}"

# Initialiseer de OpenAI client
client = openai.OpenAI()

# Bereid de input voor
input_messages = [
    {"role": "system", "content": "Je bent een behulpzame assistent."},
    {"role": "user", "content": "Hoe is het weer in Amsterdam?"}
]

# Maak een response met aangepaste functie
response = client.responses.create(
    model="gpt-4o",
    input=input_messages,
    tools=tools
)

# Verwerk de response
if response.tool_calls:
    # Haal de functie-aanroep op
    tool_call = response.tool_calls[0]
    function_name = tool_call.function.name
    function_args = json.loads(tool_call.function.arguments)

    # Roep de functie aan
    if function_name == "get_weather":
        function_response = get_weather(function_args.get("location"))

    # Voeg de functie-response toe aan de conversatie
    input_messages.append({
        "role": "assistant",
        "content": [
            {
                "type": "tool_calls",
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": function_name,
                            "arguments": tool_call.function.arguments
                        }
                    }
                ]
            }
        ]
    })

    input_messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "name": function_name,
        "content": function_response
    })

    # Haal de uiteindelijke response op
    final_response = client.responses.create(
        model="gpt-4o",
        input=input_messages
    )

    print(final_response.output_text)
else:
    print(response.output_text)
```

## Volledig Werkend Voorbeeld: AI Nieuws Agent

Hier is een voorbeeld van een volledige agent die de Responses API gebruikt om het laatste nieuws over AI op te zoeken:

```python
import openai
from datetime import datetime

client = openai.OpenAI()

# Stel de systeem instructies in
system_instructions = """Je bent een AI-nieuws specialist. Zoek het laatste nieuws
over kunstmatige intelligentie en presenteer het in het volgende format:

# AI NIEUWS UPDATE
Datum: [huidige datum]

## BELANGRIJKSTE VERHALEN
1. [Titel van het verhaal]
   - Bron: [Nieuwsbron]
   - Samenvatting: [2-3 zin samenvatting]

2. [Titel van het verhaal]
   - Bron: [Nieuwsbron]
   - Samenvatting: [2-3 zin samenvatting]

## OPKOMENDE TRENDS
* [Trend 1]: [korte uitleg]
* [Trend 2]: [korte uitleg]

## BEDRIJFSUPDATES
* [Bedrijfsnaam]: [belangrijke update over het bedrijf]

Vermeld de bronnen van je informatie met hyperlinks waar mogelijk."""

# Maak de query
query = "Zoek het laatste nieuws over AI en ML ontwikkelingen. Focus op de laatste 7 dagen."

try:
    # Gebruik de Responses API met web search tool
    response = client.responses.create(
        model="gpt-4o",
        tools=[{"type": "web_search_preview"}],  # Gebruik web search tool
        input=[
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": query}
        ]
    )

    # Haal het resultaat op en print het
    result = response.output_text
    print(result)

    # Sla het resultaat op in een bestand
    with open(f"ai_news_{datetime.now().strftime('%Y%m%d')}.md", "w", encoding="utf-8") as f:
        f.write(result)

except Exception as e:
    print(f"Er is een fout opgetreden: {str(e)}")
```

## Verschillen tussen API's

### Responses API vs. Chat Completions API

| Kenmerk | Responses API | Chat Completions API |
|---------|--------------|----------------------|
| Input Format | `input` parameter (string of array) | `messages` parameter (array) |
| Output Format | `output_text` attribuut | `choices[0].message.content` |
| Ingebouwde Tools | web_search_preview, file_search | Alleen function calling |
| State Management | Ingebouwd | Niet ingebouwd |
| Interface | Gestroomlijnd | Eenvoudig |
| Ondersteunde Modellen | gpt-4o en andere nieuwere modellen | Bredere modelondersteuning |

### Responses API vs. Assistants API

| Kenmerk | Responses API | Assistants API |
|---------|--------------|----------------|
| Interface | Gestroomlijnd, directe API calls | Complexer met Assistants en Threads |
| State Management | Ingebouwd | Ingebouwd |
| Ingebouwde Tools | web_search_preview, file_search, computer use | Code interpreter, retrieval, function calling |
| Syntax | Eenvoudiger directe aanroepen | Meerdere objecten met veel endpoints |
| Prestaties | Geoptimaliseerd voor snelheid | Meer feature-rijk |

## Migratie naar de Responses API

### Van Chat Completions naar Responses API

**Chat Completions API met Function Calling:**
```python
import openai
import json

client = openai.OpenAI()

# Chat Completions aanroep
response = client.chat.completions.create(
    model="gpt-4-turbo",
    messages=[
        {"role": "system", "content": "Je bent een behulpzame assistent."},
        {"role": "user", "content": "Hoe is het weer in Amsterdam?"}
    ],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Haal het weer op",
            "parameters": {"type": "object", "properties": {"location": {"type": "string"}}}
        }
    }],
    tool_choice="auto"
)

# Resultaat ophalen
print(response.choices[0].message.content)
```

**Responses API:**
```python
import openai
import json

client = openai.OpenAI()

# Responses API aanroep
response = client.responses.create(
    model="gpt-4o",
    input=[
        {"role": "system", "content": "Je bent een behulpzame assistent."},
        {"role": "user", "content": "Hoe is het weer in Amsterdam?"}
    ],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Haal het weer op",
            "parameters": {"type": "object", "properties": {"location": {"type": "string"}}}
        }
    }]
)

# Resultaat ophalen
print(response.output_text)
```

### Van Assistants API naar Responses API

OpenAI is van plan om alle belangrijke functies van de Assistants API naar de Responses API te brengen. Zodra feature-pariteit is bereikt (verwacht in 2025-2026), zal OpenAI de uitfasering van de Assistants API aankondigen met een ondersteuningsperiode van 12 maanden.

## Tijdlijn voor Migratie

- **2023**: Completions API uitgefaseerd ten gunste van Chat Completions API
- **2025-2026**: Responses API bereikt naar verwachting feature-pariteit met Assistants API
- **2026**: Geplande aankondiging van uitfasering voor Assistants API
- **2027**: Einde van ondersteuning voor Assistants API (12 maanden na aankondiging van uitfasering)

## Best Practices

### Wanneer welke API te gebruiken

- Gebruik **Chat Completions** voor eenvoudige conversatie-interfaces zonder complexe tools
- Gebruik **Responses API** wanneer je nodig hebt:
  - Ingebouwde tools zoals web search
  - State management over conversatiebeurten
  - Een vereenvoudigde interface voor agents
- Gebruik **Assistants API** (voorlopig) wanneer je specifieke functies nodig hebt die nog niet beschikbaar zijn in de Responses API

### Optimaliseren van Prestaties

- Houd instructies beknopt en specifiek
- Gebruik het juiste model voor je use case (gpt-4o voor Responses API)
- Implementeer een fallback mechanisme voor het geval de Responses API niet beschikbaar is

### Veiligheidsoverwegingen

- Valideer alle invoer voordat je deze verwerkt
- Implementeer rate limiting voor API-aanroepen
- Wees voorzichtig met web search en computer use tools in productieomgevingen

## Bronnen

- [OpenAI API Documentatie](https://platform.openai.com/docs)
- [OpenAI Quickstart Guide](https://platform.openai.com/docs/quickstart?api-mode=responses)
- [OpenAI Cookbook](https://cookbook.openai.com/)
