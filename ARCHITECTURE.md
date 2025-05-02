# Broodjes App - Architecture Overview (As of May 2, 2024)

This document outlines the current technical architecture, component setup, and primary user workflows for the Broodjes App.

## 1. Core Components

The application is built using a combination of a static frontend, serverless functions (Netlify & Google Cloud), and a Supabase database backend.

*   **Frontend:**
    *   Files: `frontend/index.html`, `frontend/styles.css`, `frontend/script.js`
    *   Technology: Vanilla JavaScript, HTML, CSS
    *   Hosting: Netlify Static Site Hosting
    *   Functionality: Handles user input for recipe ideas, displays generated/saved/refined recipes and cost breakdowns, triggers backend operations via API calls.

*   **Backend - Netlify Functions (`netlify/functions/`):**
    *   `/api/getRecipes`: Fetches saved recipe data (original recipe JSON + cost breakdown text) from the Supabase `async_tasks` table. Uses Supabase Anon Key (potential future change needed if RLS restricts).
    *   `/api/getCostBreakdown`: Calculates or estimates a detailed cost breakdown for a specific recipe task (`task_id`).
        *   Attempts to calculate costs for each ingredient using prices from the Supabase `ingredients` table.
        *   If **all** ingredients are found and costed successfully from the DB, it returns a breakdown based solely on DB prices (`calculationType: 'db'`).
        *   If **no** ingredients can be costed from the DB, it falls back to OpenAI (`gpt-4o-mini`) for an estimate of the entire recipe (`calculationType: 'ai'`).
        *   If **some** ingredients are found in the DB and others are not (or have parsing/unit issues), it performs a **hybrid** calculation:
            *   Gets a full recipe cost estimate from OpenAI (`gpt-4o-mini`).
            *   Extracts the total cost from the AI estimate.
            *   Calculates the cost of unknown/failed items by subtracting the known DB costs from the AI's total estimate.
            *   Combines the known DB costs and the estimated cost for failed items into a final total.
            *   Formats a breakdown indicating which items were costed via DB and which were part of the AI estimate (`calculationType: 'hybrid'`).
            *   Includes fallback formatting if the AI estimate or total extraction fails (`calculationType: 'db_partial'` or `'db_partial_ai_failed'`).
        *   Saves the final generated breakdown text and the `calculationType` to `async_tasks`.
        *   Requires Supabase Service Role Key for DB writes.
    *   `/api/refineRecipe`: Refines an existing recipe based on user input.
        *   Fetches the original recipe JSON and existing cost breakdown text from `async_tasks` using the `task_id`.
        *   Calls OpenAI (`gpt-3.5-turbo` or `gpt-4o`) with the original data and user request to generate a *combined* updated recipe and cost breakdown text.
        *   Saves the full refined text output to `async_tasks.cost_breakdown`.
        *   Requires Supabase Service Role Key for DB reads/writes.

*   **Backend - Google Cloud Functions (GCF):**
    *   `gcf-generate-recipe/index.js` (Deployed as `generateRecipe`):
        *   Triggered via HTTP request from the frontend.
        *   Receives recipe idea/ingredients.
        *   Calls OpenAI (`gpt-4o` or `gpt-4o-mini`, selected by frontend) to generate the initial recipe as a JSON string.
        *   Saves the recipe JSON to `async_tasks.recipe`.
        *   Also inserts a record into the separate `recipes` table (role needs clarification).
        *   Gets an *initial* total cost estimate from OpenAI during generation.
        *   Returns the recipe JSON and the initial AI total cost estimate.
        *   Uses Supabase **Anon Key**.
    *   `gcf-calculate-cost/index.js` (Deployed as `calculateCost`):
        *   Triggered periodically by Google Cloud Scheduler (every 5 mins).
        *   *Intended* to find tasks without cost breakdowns and calculate/estimate them (DB prices or AI fallback).
        *   Saves the result to `async_tasks.estimated_cost` (Note: this might be partially redundant now due to `/api/getCostBreakdown`).
        *   Requires Supabase Service Role Key.

*   **Database (Supabase - PostgreSQL):**
    *   `async_tasks` table: Primary table tracking recipe generation. Stores `task_id` (UUID), initial idea (`prompt`), status (`status`), generated recipe JSON (`recipe`), final cost breakdown text (`cost_breakdown`), timestamps (`created_at`, `updated_at`), and potentially a separate total cost (`estimated_cost`).
    *   `recipes` table: Secondary table. `gcf-generate-recipe` currently duplicates the initial idea and recipe JSON here. Its long-term purpose requires review.
    *   `ingredients` table: Stores ingredient names and their prices (e.g., price per unit/kg) used by `/api/getCostBreakdown`.

*   **External Services:**
    *   **OpenAI API:** Used for recipe generation, refinement, and cost estimation fallbacks. Keys are stored as environment variables.
    *   **Netlify:** Hosts the frontend and Netlify Functions. Manages environment variables for these functions.
    *   **Google Cloud Platform (GCP):** Hosts GCFs (`generateRecipe`, `calculateCost`). Manages environment variables for GCFs. Runs Cloud Scheduler for `calculateCost`.

*   **Source Control & CI/CD:**
    *   **GitHub (`Rul1an/broodjes-ai-mvp`):** Hosts the codebase.
    *   **Netlify:** Deploys frontend and Netlify functions automatically on pushes to the connected branch (e.g., `Broodjes-ai-v2`).
    *   **GitHub Actions (`.github/workflows/`):** Deploys GCFs (`generateRecipe`, `calculateCost`) on pushes to the relevant branch.

## 2. Primary Workflows

### A. Generate New Recipe

1.  **Frontend:** User enters ingredients/idea, selects model (`gpt-4o` or `gpt-4o-mini`), clicks "Generate".
2.  **Frontend (`script.js`):** Sends POST request to the deployed `generateRecipe` GCF endpoint.
3.  **GCF (`generateRecipe`):**
    *   Calls OpenAI API with the user's prompt and selected model.
    *   Receives recipe JSON from OpenAI.
    *   Calls OpenAI again (or includes in first call) for an *initial total cost estimate*.
    *   Saves recipe JSON to `async_tasks.recipe` (using Anon Key).
    *   Saves recipe JSON to `recipes` table (using Anon Key).
    *   Returns `{ recipe: <json_string>, initialEstimatedCost: <cost_string> }` to the frontend.
4.  **Frontend (`script.js`):**
    *   Parses the response.
    *   Formats and displays the recipe from the JSON string.
    *   Displays the `initialEstimatedCost` temporarily.
    *   Immediately sends POST request to `/api/getCostBreakdown` with the `task_id` from the `async_tasks` table (obtained implicitly or explicitly).
5.  **Netlify Function (`/api/getCostBreakdown`):**
    *   Fetches recipe JSON from `async_tasks` using `task_id`.
    *   Fetches prices from `ingredients` table.
    *   Performs calculation using DB prices for known ingredients and falls back to AI estimation for unknown/failed ingredients (potentially using a hybrid approach).
    *   Saves the final breakdown text and calculation type (e.g., 'db', 'ai', 'hybrid') to `async_tasks.cost_breakdown` (using Service Role Key).
    *   Returns `{ breakdown: <text>, calculationType: <type> }` to the frontend.
6.  **Frontend (`script.js`):**
    *   Receives the breakdown.
    *   Updates the UI to show the detailed cost breakdown, replacing the initial estimate.

### B. View Saved Recipes

1.  **Frontend:** User navigates to the "Saved Recipes" section.
2.  **Frontend (`script.js`):** Sends GET request to `/api/getRecipes`.
3.  **Netlify Function (`/api/getRecipes`):**
    *   Queries the `async_tasks` table for relevant records (potentially filtering/paginating).
    *   Selects `task_id`, `recipe` (JSON), `cost_breakdown` (text), `created_at`, etc.
    *   Returns the list of recipe data.
4.  **Frontend (`script.js`):**
    *   Formats the received `recipe` JSON and `cost_breakdown` text for each item.
    *   Displays the list of recipes.

### C. Refine Recipe

1.  **Frontend:** User clicks "Refine" on a displayed recipe, enters refinement instructions.
2.  **Frontend (`script.js`):** Sends POST request to `/api/refineRecipe` with `{ recipeId: <task_id>, refinementRequest: <user_text> }`.
3.  **Netlify Function (`/api/refineRecipe`):**
    *   Fetches `recipe` (JSON) and `cost_breakdown` (text) from `async_tasks` using `recipeId` (Service Role Key).
    *   Constructs a detailed prompt for OpenAI including original recipe, existing breakdown, and user request.
    *   Calls OpenAI (`gpt-3.5-turbo` or `gpt-4o`).
    *   Receives the *combined* refined recipe + breakdown text from OpenAI.
    *   Updates `async_tasks`, overwriting the `cost_breakdown` column with the new combined text (Service Role Key).
    *   Returns `{ recipe: <refined_text> }` to the frontend.
4.  **Frontend (`script.js`):**
    *   Displays the updated recipe/cost breakdown text.

## 3. Environment Variables

Ensure the following are configured correctly:

*   **Netlify (Site settings > Build & deploy > Environment):**
    *   `OPENAI_API_KEY`
    *   `SUPABASE_URL`
    *   `SERVICE_ROLE_KEY` (Supabase Service Role Key)
    *   `SUPABASE_ANON_KEY` (Potentially needed by `/api/getRecipes`?)
*   **GCP (GCF Deployment):**
    *   `OPENAI_API_KEY`
    *   `SUPABASE_URL`
    *   `SUPABASE_ANON_KEY` (For `generateRecipe`)
    *   `SERVICE_ROLE_KEY` (For `calculateCost`)

## 4. Potential Improvements / Areas for Review

*   **`recipes` Table Redundancy:** Evaluate if the `recipes` table is still necessary or if `async_tasks` can serve as the single source of truth.
*   **`calculateCost` GCF:** Determine if this periodic function is still needed given the immediate calculation in `/api/getCostBreakdown`. If kept, align its update logic (e.g., target `cost_breakdown` column).
*   **Key Usage:** Review if `/api/getRecipes` should use the Service Role Key if RLS policies might restrict access via the Anon key in the future.
*   **Code Duplication:** Look for opportunities to share helper functions (e.g., cost calculation logic, quantity parsing) between Netlify Functions and GCFs if feasible.
*   **Error Handling:** Enhance robustness, particularly around API calls and database interactions.
*   **Model Consistency:** Standardize which OpenAI models are used for specific tasks (generation vs. cost vs. refinement).
