import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize OpenAI client
# Make sure OPENAI_API_KEY is set in your .env file
try:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except Exception as e:
    print(f"Error initializing OpenAI client: {e}")
    # Consider how to handle this error in a production scenario
    client = None


@app.route('/api/generate', methods=['POST'])
def generate_recipe():
    if not client:
        return jsonify({"error": "OpenAI client not initialized. Check API key."}), 500

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON data"}), 400

    idea = data.get('idea')
    # Get model from request, default to gpt-3.5-turbo if not provided
    requested_model = data.get('model', 'gpt-3.5-turbo')

    # Basic validation for allowed models (optional but recommended)
    allowed_models = ['gpt-3.5-turbo', 'gpt-4o']
    if requested_model not in allowed_models:
        # You might want to log this or return a more specific error
        # For now, we default back to 3.5-turbo
        print(
            f"Warning: Received unsupported model '{requested_model}', defaulting to gpt-3.5-turbo.")
        model_to_use = 'gpt-3.5-turbo'
    else:
        model_to_use = requested_model

    if not idea:
        return jsonify({"error": "No idea provided"}), 400

    try:
        # Construct the prompt for the AI
        prompt = f"""
        Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '{idea}'.
        Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
        Beschrijf de bereidingsstappen duidelijk en beknopt.
        Houd het recept praktisch en gericht op een snelle bereiding.
        Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
        """

        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model=model_to_use,  # <-- Use the selected model
        )

        recipe = chat_completion.choices[0].message.content
        # TODO: Consider adding cost estimation logic here if needed
        # For now, just return the recipe
        # Return None for cost for now
        return jsonify({"recipe": recipe, "estimated_cost": None})

    except Exception as e:
        print(f"Error calling OpenAI API with model {model_to_use}: {e}")
        return jsonify({"error": "Failed to generate recipe"}), 500


if __name__ == '__main__':
    # Make sure to set the host and port as needed
    # Using port 5001 to avoid conflict with potential frontend dev servers
    app.run(debug=True, port=5001)
