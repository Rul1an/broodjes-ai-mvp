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
    *   `/api/generateRecipe`: (New) Handles recipe generation requests.
        *   Receives ingredients/idea, type, language, model from frontend.
        *   Calls OpenAI API (model selected by user or default) to generate recipe JSON.
        *   Saves the recipe JSON, idea, status ('completed') to the `async_tasks` table.
        *   Uses Supabase **Service Role Key** for database write.
        *   Returns the generated recipe object and the new `taskId`.
    *   `/api/getRecipes`: Fetches saved recipe data (original recipe JSON + cost breakdown text) from the Supabase `async_tasks` table. Uses Supabase Anon Key (potential future change needed if RLS restricts).
    *   `/api/getCostBreakdown`: Calculates or estimates a detailed cost breakdown for a specific recipe task (`task_id`).
        *   Attempts to calculate costs for each ingredient using prices from the Supabase `ingredients` table.
        *   It **normalizes units** (e.g., 'gram' -> 'g', 'plakjes' -> 'stuks') from both the recipe and the database.
        *   If units differ after normalization, it **attempts conversion** (e.g., g to kg, ml to l) using the `getConvertedQuantity` helper.
        *   If conversion succeeds or units match, the DB price is used (`calculatedItems`). Items fail if conversion is not possible, units are incompatible, ingredient not found, or parsing fails (`failedItems`).
        *   If **all** ingredients are costed successfully from the DB (`failedItems` is empty), it returns a breakdown based solely on DB prices (`calculationType: 'db'`).
        *   If **no** ingredients can be costed from the DB (`calculatedItems` is empty), it falls back to OpenAI (`gpt-4o-mini`) for an estimate of the **entire** recipe using the `getAICostBreakdownEstimate` helper (`calculationType: 'ai'`).
        *   If **some** ingredients are found/converted/costed from the DB and others fail, it performs a **precise hybrid** calculation:
            *   Calculates the total cost of known items from the DB (`totalDbCost`).
            *   Calls a separate helper (`getAIEstimateForSpecificItems`) that asks OpenAI (`gpt-4o-mini`) to estimate the combined cost **only** for the `failedItems`.
            *   Combines the `totalDbCost` and the AI estimate for failed items (`aiEstimateForFailed`) to get the `finalTotalCost`.
            *   Formats a breakdown indicating which items were costed via DB and noting the failed items were estimated by AI, showing the final hybrid total (`calculationType: 'hybrid'`).
            *   Includes fallback formatting if the AI estimate for specific items fails (`calculationType: 'hybrid_ai_failed'`).
        *   Saves the final generated breakdown text and the `calculationType` to `async_tasks`.
        *   Requires Supabase Service Role Key for DB writes.
    *   `/api/refineRecipe`: Refines an existing recipe based on user input.
        *   Fetches the original recipe JSON and existing cost breakdown text from `async_tasks` using the `task_id`.
        *   Calls OpenAI (`gpt-3.5-turbo` or `gpt-4o`) with the original data and user request to generate a *combined* updated recipe and cost breakdown text.
        *   Saves the full refined text output to `async_tasks.cost_breakdown`.
        *   Requires Supabase Service Role Key for DB reads/writes.

*   **Backend - Google Cloud Functions (GCF):**
    *   ~~`gcf-generate-recipe/index.js` (Deployed as `generateRecipe`):~~ (Removed - Logic migrated to Netlify Function `/api/generateRecipe`)
    *   ~~`gcf-calculate-cost/index.js` (Deployed as `calculateCost`):~~ (Removed - Functionality covered by `/api/getCostBreakdown`)

*   **Database (Supabase - PostgreSQL):**
    *   `async_tasks` table: Primary table tracking recipe generation. Stores `task_id` (UUID), initial idea (`prompt`), status (`status`), generated recipe JSON (`recipe`), final cost breakdown text (`cost_breakdown`), cost calculation type (`cost_calculation_type`), timestamps (`created_at`, `updated_at`), and potentially a separate total cost (`estimated_cost`).
    *   ~~`recipes` table:~~ (Removed - Redundant)
    *   `ingredients` table: Stores ingredient names and their prices (e.g., price per unit/kg) used by `/api/getCostBreakdown`.

*   **External Services:**
    *   **OpenAI API:** Used for recipe generation, refinement, and cost estimation fallbacks. Keys are stored as environment variables.
    *   **Netlify:** Hosts the frontend and **all** backend API Netlify Functions. Manages environment variables for these functions.
    *   ~~**Google Cloud Platform (GCP):**~~ (Removed - No longer used for functions or scheduler in this project)

*   **Source Control & CI/CD:**
    *   **GitHub (`Rul1an/broodjes-ai-mvp`):** Hosts the codebase.
    *   **Netlify:** Deploys frontend and Netlify functions automatically on pushes to the connected branch (e.g., `Broodjes-ai-v2`).
    *   ~~**GitHub Actions (`.github/workflows/`):** Deploys GCFs (`calculateCost`) on pushes to the relevant branch.~~ (Removed - GCF deployment no longer needed, review workflow file if it exists)

## 2. Primary Workflows

### A. Generate New Recipe

1.  **Frontend:** User enters ingredients/idea, selects model (`gpt-4o` or `gpt-4o-mini`), clicks "Generate".
2.  **Frontend (`script.js`):** Sends POST request to the `/api/generateRecipe` Netlify Function endpoint.
3.  **Netlify Function (`/api/generateRecipe`):**
    *   Calls OpenAI API with the user's prompt and selected model.
    *   Receives recipe JSON from OpenAI.
    *   Saves recipe JSON, idea, model, status='completed' to `async_tasks` (using Service Key).
    *   Returns `{ recipe: <json_object>, taskId: <new_task_id> }` to the frontend.
4.  **Frontend (`script.js`):**
    *   Parses the response.
    *   Formats and displays the recipe from the JSON object.
    *   Adds placeholder for cost breakdown using the received `taskId`.
    *   Immediately sends GET request to `/api/getCostBreakdown?taskId=<new_task_id>`.
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
*   ~~**GCP (GCF Deployment):**~~ (Removed)

## 4. Potential Improvements / Areas for Review

*   **Consolidate Platform:** (Done) Migrated `generateRecipe` from GCF to Netlify Functions.
*   **Eliminate Redundancy:** (Done) Removed `recipes` table, `calculateCost` GCF, and Cloud Scheduler Job.
*   **Standardize Key Usage:** Review if `/api/getRecipes` should use the Service Role Key instead of the Anon Key, especially if Row Level Security might be implemented later.
*   **Share Helper Code:** Create a shared `lib/` or `utils/` directory within `netlify/functions/` to centralize common helpers like `parseQuantityAndUnit`, `normalizeUnit`, `getConvertedQuantity`, etc., and import them where needed to avoid duplication.
*   **Optimize AI Calls & Costs:** Review if the default model for generation/refinement (`gpt-4o-mini`?) is optimal. Consider fine-tuning prompts or exploring model choices further.
*   **Enhance Error Handling & Logging:** Implement more consistent error response formats across API functions and ensure logs capture sufficient context for debugging.
*   **Refine Unit Conversion:** Expand the `getConvertedQuantity` helper with more conversions (e.g., approximate volume units like 'el'/'tl' to 'ml') if needed based on common recipe formats.
