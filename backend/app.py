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


@app.route('/generate', methods=['POST'])
def generate_recipe():
    if not client:
        return jsonify({"error": "OpenAI client not initialized. Check API key."}), 500

    data = request.get_json()
    idea = data.get('idea')

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
            model="gpt-3.5-turbo",  # Or use gpt-4 if available/preferred
        )

        recipe = chat_completion.choices[0].message.content
        return jsonify({"recipe": recipe})

    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return jsonify({"error": "Failed to generate recipe"}), 500


if __name__ == '__main__':
    # Make sure to set the host and port as needed
    # Using port 5001 to avoid conflict with potential frontend dev servers
    app.run(debug=True, port=5001)