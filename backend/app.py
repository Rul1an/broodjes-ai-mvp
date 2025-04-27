import os
# Remove uuid and threading imports
# import uuid
# import threading
import requests  # Added requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from supabase import create_client, Client  # Added Supabase

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# --- Remove In-memory storage ---
# task_results = {}

# --- Initialize Supabase Client ---
# Requires SUPABASE_URL and SUPABASE_KEY environment variables set in Netlify
supabase_url = os.getenv("SUPABASE_URL")
# This should be the anon key for client-side or service_role key for backend
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = None
try:
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        print("Supabase client initialized successfully.")
    else:
        print("Error: SUPABASE_URL or SUPABASE_KEY environment variables not set.")
except Exception as e:
    print(f"Error initializing Supabase client: {e}")
# -----------------------------------


# --- Initialize OpenAI Client ---
# Requires OPENAI_API_KEY environment variable
openai_api_key = os.getenv("OPENAI_API_KEY")
openai_client: OpenAI = None
try:
    if openai_api_key:
        openai_client = OpenAI(api_key=openai_api_key)
        print("OpenAI client initialized successfully.")
    else:
        print("Error: OPENAI_API_KEY environment variable not set.")
except Exception as e:
    print(f"Error initializing OpenAI client: {e}")
# ---------------------------------

# --- Remove Helper function for threading ---
# def _run_openai_task(task_id, idea, model_to_use): ...


# --- Asynchronous Endpoints using Supabase ---

@app.route('/api/generate-start', methods=['POST'])
def generate_recipe_start():
    # Ensure Supabase client is available
    if not supabase:
        return jsonify({"error": "Supabase client not initialized. Check SUPABASE_URL/KEY."}), 500

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON data"}), 400

    idea = data.get('idea')
    requested_model = data.get('model', 'gpt-4o')  # Default to gpt-4o

    allowed_models = ['gpt-3.5-turbo', 'gpt-4o']
    if requested_model not in allowed_models:
        print(
            f"Warning: Received unsupported model '{requested_model}', defaulting to gpt-4o.")
        model_to_use = 'gpt-4o'
    else:
        model_to_use = requested_model

    if not idea:
        return jsonify({"error": "No idea provided"}), 400

    try:
        # 1. Create task record in Supabase
        print(f"Inserting task for idea: '{idea}' with model: {model_to_use}")
        insert_response = supabase.table('async_tasks').insert({
            'idea': idea,
            'model': model_to_use,
            'status': 'pending'
        }).execute()

        # Check for insertion errors
        if insert_response.data is None or len(insert_response.data) == 0:
            # Supabase python client v1 might return None on error, v2 list might be empty or error is in response property
            error_details = "Unknown insertion error"
            if hasattr(insert_response, 'error') and insert_response.error:
                error_details = str(insert_response.error)
            # Check older potential format
            elif hasattr(insert_response, 'message') and insert_response.message:
                error_details = insert_response.message
            print(f"Error inserting task into Supabase: {error_details}")
            print(f"Response details: {insert_response}")
            return jsonify({"error": f"Failed to create task record in database: {error_details}"}), 500

        task_record = insert_response.data[0]
        task_id = task_record['task_id']
        print(f"Task record created successfully with ID: {task_id}")

        # 2. Trigger the Netlify Background Function
        #    Construct the URL relative to the site root.
        #    Ensure the background function follows the naming convention: function_dir/function_name-background/main.go
        #    e.g., netlify/functions/background_generate_go-background/main.go
        background_function_url = "/.netlify/functions/background_generate_go-background"

        # Prepare data to send to the background function
        payload = {
            'task_id': task_id,
            'idea': idea,
            'model': model_to_use
        }

        print(
            f"Triggering GO background function at: {background_function_url} for task {task_id}")

        # Make the POST request to trigger the background function
        # We don't wait for the response body here, just check status.
        # Add basic error handling for the request itself.
        try:
            # Short timeout, we just need to trigger
            trigger_response = requests.post(
                background_function_url, json=payload, timeout=5)

            # Check if the trigger request itself failed (network issue, wrong URL etc.)
            # Netlify should return 202 Accepted if the function is triggered successfully.
            if trigger_response.status_code != 202:
                # If triggering failed, update the task status to failed in Supabase
                print(
                    f"Error triggering GO background function. Status: {trigger_response.status_code}, Response: {trigger_response.text}")
                supabase.table('async_tasks').update({
                    'status': 'failed',
                    'error_message': f'Failed to trigger background function (HTTP {trigger_response.status_code})'
                }).eq('task_id', task_id).execute()
                return jsonify({"error": f"Failed to trigger background generation task (HTTP {trigger_response.status_code})"}), 500

            print(
                f"Background function triggered successfully for task {task_id} (Status Code: {trigger_response.status_code})")

        except requests.exceptions.RequestException as req_err:
            # Handle network errors during trigger attempt
            print(
                f"Network error triggering GO background function: {req_err}")
            supabase.table('async_tasks').update({
                'status': 'failed',
                'error_message': f'Network error triggering GO background function: {req_err}'
            }).eq('task_id', task_id).execute()
            return jsonify({"error": f"Network error triggering background generation task: {req_err}"}), 500

        # 3. Return task_id to frontend
        return jsonify({"task_id": task_id}), 202  # 202 Accepted

    except Exception as e:
        # Catch-all for other unexpected errors during start process
        print(f"Unexpected error in /api/generate-start: {e}")
        # Attempt to update status if task_id was created, otherwise just return generic error
        if 'task_id' in locals():
            try:
                supabase.table('async_tasks').update({
                    'status': 'failed',
                    'error_message': f'Unexpected error during task start: {e}'
                }).eq('task_id', task_id).execute()
            except Exception as update_err:
                print(
                    f"Failed to update task status to failed after error: {update_err}")
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500


@app.route('/api/generate-status/<task_id>', methods=['GET'])
def generate_recipe_status(task_id):
    if not supabase:
        return jsonify({"error": "Supabase client not initialized."}), 500

    try:
        # Query Supabase for the task status
        response = supabase.table('async_tasks').select(
            # Add estimated_cost if needed later
            'task_id', 'status', 'recipe', 'estimated_cost', 'error_message'
            # maybe_single returns None if not found
        ).eq('task_id', task_id).maybe_single().execute()

        if response.data:
            result = response.data
            # Map Supabase result to the format expected by the frontend
            frontend_result = {
                "status": result.get("status"),
                "recipe": result.get("recipe"),
                # Assumes cost might be added later
                "estimated_cost": result.get("estimated_cost"),
                "error": result.get("error_message")
            }
            return jsonify(frontend_result)
        elif response.data is None:
            # Handle case where maybe_single finds nothing
            return jsonify({"status": "not_found", "error": "Task ID not found in database"}), 404
        else:
            # Handle potential errors from the Supabase query itself
            error_details = "Unknown Supabase query error"
            if hasattr(response, 'error') and response.error:
                error_details = str(response.error)
            elif hasattr(response, 'message') and response.message:
                error_details = response.message
            print(f"Error querying task status from Supabase: {error_details}")
            print(f"Response details: {response}")
            return jsonify({"status": "error", "error": f"Database query failed: {error_details}"}), 500

    except Exception as e:
        print(
            f"Unexpected error in /api/generate-status for task {task_id}: {e}")
        return jsonify({"status": "error", "error": f"An unexpected error occurred: {e}"}), 500


# --- Keep Original Synchronous Endpoint for reference/testing (Optional) ---
# Consider removing this if not needed to simplify the code
@app.route('/api/generate', methods=['POST'])
def generate_recipe_sync():  # Renamed function to avoid conflict
    if not openai_client:  # Use the initialized OpenAI client
        return jsonify({"error": "OpenAI client not initialized. Check API key."}), 500

    data = request.get_json()
    # ... (rest of the synchronous logic remains largely the same, using openai_client) ...
    # ... Ensure it also uses the prompt without the JSON block instruction if desired ...
    idea = data.get('idea')
    requested_model = data.get('model', 'gpt-3.5-turbo')
    allowed_models = ['gpt-3.5-turbo', 'gpt-4o']
    if requested_model not in allowed_models:
        model_to_use = 'gpt-3.5-turbo'
    else:
        model_to_use = requested_model
    if not idea:
        return jsonify({"error": "No idea provided"}), 400

    try:
        prompt = f"""
        Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '{idea}'.
        Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
        Beschrijf de bereidingsstappen duidelijk en beknopt.
        Houd het recept praktisch en gericht op een snelle bereiding.
        Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
        Bevat GEEN json block aan het einde van je antwoord.
        """
        chat_completion = openai_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt, }],
            model=model_to_use,
        )
        recipe = chat_completion.choices[0].message.content
        json_marker = '```json'
        if json_marker in recipe:
            recipe = recipe.split(json_marker)[0].strip()
        return jsonify({"recipe": recipe, "estimated_cost": None})

    except Exception as e:
        print(
            f"Error calling OpenAI API (sync) with model {model_to_use}: {e}")
        return jsonify({"error": "Failed to generate recipe (sync)"}), 500


if __name__ == '__main__':
    # Using port 5001 for local dev server
    app.run(debug=True, port=5001)
