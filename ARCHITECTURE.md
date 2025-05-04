# Broodjes App - Architecture Overview (As of May 2, 2024)

This document outlines the current technical architecture, component setup, and primary user workflows for the Broodjes App.

## 1. Core Components

The application is built using a combination of a static frontend, serverless functions (Netlify & Google Cloud), and a Supabase database backend.

*   **Frontend:**
    *   Files: `frontend/index.html`, `frontend/styles.css`, `frontend/js/` (directory)
    *   Technology: Vanilla JavaScript (ES Modules), HTML, CSS
    *   Structure: Modular JavaScript with `js/main.js` as the entry point.
        *   `js/main.js`: Initializes the application and loads other modules.
        *   `js/apiService.js`: Handles all communication with the backend Netlify functions.
        *   `js/uiUtils.js`: Contains helpers for common UI tasks (loading indicators, button states).
        *   `js/utils.js`: Contains non-DOM utility functions (text formatting, data extraction).
        *   `js/views/navigation.js`: Manages view switching logic.
        *   `js/views/generateView.js`: Handles logic for the recipe generation form.
        *   `js/views/recipeListView.js`: Handles displaying, loading, refining, and clearing saved recipes.
        *   `js/views/ingredientView.js`: Handles displaying and managing ingredients.
    *   Hosting: Netlify Static Site Hosting
    *   Functionality: Handles user input, displays data, triggers backend operations via API calls organized in modules.

*   **Backend - Netlify Functions (`netlify/functions/`):**
    *   `/api/generateRecipe` (`generateRecipe.js`): Handles recipe generation requests.
        *   Receives ingredients/idea, type, language, model from frontend.
        *   Calls OpenAI API (model selected by user or default) to generate recipe JSON.
        *   Saves the recipe JSON, idea, status ('completed') to the `async_tasks` table.
        *   Uses Supabase **Service Role Key** for database write.
        *   Returns the generated recipe object and the new `taskId`.
    *   `/api/getRecipes` (`getRecipes.js`): Fetches saved recipe data (original recipe JSON + cost breakdown text) from the Supabase `async_tasks` table. Uses Supabase **Service Role Key** (standardized).
    *   `/api/getCostBreakdown` (`getCostBreakdown.js`): Calculates or estimates a detailed cost breakdown for a specific recipe task (`task_id`).
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
    *   `/api/refineRecipe` (`refineRecipe.js`): Refines an existing recipe based on user input.
        *   Fetches the original recipe JSON and existing cost breakdown text from `async_tasks` using the `task_id`.
        *   Calls OpenAI (`gpt-3.5-turbo` or `gpt-4o`) with the original data and user request to generate a *combined* updated recipe and cost breakdown text.
        *   Saves the full refined text output to `async_tasks.cost_breakdown`.
        *   Requires Supabase Service Role Key for DB reads/writes.
    *   `/api/getIngredients` (`getIngredients.js`): Fetches the list of ingredients and their prices from the `ingredients` table.
    *   `/api/addIngredient` (`addIngredient.js`): Adds a new ingredient to the `ingredients` table. Requires Service Role Key.
    *   `/api/updateIngredient` (`updateIngredient.js`): Updates an existing ingredient in the `ingredients` table. Requires Service Role Key.
    *   `/api/deleteIngredient` (`deleteIngredient.js`): Deletes an ingredient from the `ingredients` table. Requires Service Role Key.
    *   `/api/clearRecipes` (`clearRecipes.js`): Deletes all records from the `async_tasks` table. Requires Service Role Key.

*   **Backend - Shared Libraries (`netlify/functions/lib/`):**
    *   `costUtils.js`: Contains helpers for parsing quantities/units, normalization, conversion, and cost calculation logic used by `/api/getCostBreakdown`.
    *   `openaiClient.js`: Utility to initialize and provide the OpenAI API client.
    *   `supabaseClient.js`: Utility to initialize and provide the Supabase client (using Service Role Key).

*   **Backend - Google Cloud Functions (GCF):**
    *   ~~`gcf-generate-recipe/index.js` (Deployed as `generateRecipe`):~~ (Removed - Logic migrated to Netlify Function `/api/generateRecipe`)
    *   ~~`gcf-calculate-cost/index.js` (Deployed as `calculateCost`):~~ (Removed - Functionality covered by `/api/getCostBreakdown`)

*   **Database (Supabase - PostgreSQL):**
    *   `async_tasks` table: Primary table tracking recipe generation. Stores `task_id` (UUID), initial idea (`prompt`), status (`status`), generated recipe JSON (`recipe`), final cost breakdown text (`cost_breakdown`), cost calculation type (`cost_calculation_type`), timestamps (`created_at`, `updated_at`), and potentially a separate total cost (`estimated_cost`).
    *   ~~`recipes` table:~~ (Removed - Redundant)
    *   `ingredients` table: Stores ingredient names and their prices (e.g., price per unit/kg) used by `/api/getCostBreakdown` and managed via ingredient API functions.

*   **External Services:**
    *   **OpenAI API:** Used for recipe generation, refinement, and cost estimation fallbacks. Keys are stored as environment variables. Accessed via `lib/openaiClient.js`.
    *   **Netlify:** Hosts the frontend and **all** backend API Netlify Functions. Manages environment variables for these functions.
    *   ~~**Google Cloud Platform (GCP):**~~ (Removed - No longer used for functions or scheduler in this project)

*   **Source Control & CI/CD:**
    *   **GitHub (`Rul1an/broodjes-ai-mvp`):** Hosts the codebase.
    *   **Netlify:** Deploys frontend and Netlify functions automatically on pushes to the connected branch (e.g., `Broodjes-ai-v2`).
    *   ~~**GitHub Actions (`.github/workflows/`):** Deploys GCFs (`calculateCost`) on pushes to the relevant branch.~~ (Removed - GCF deployment no longer needed, review workflow file if it exists)

## 2. Primary Workflows

### A. Generate New Recipe

1.  **Frontend:** User enters ingredients/idea, selects model (`gpt-4o` or `gpt-4o-mini`), clicks "Generate".
2.  **Frontend (`js/views/generateView.js`):** Calls `apiService.generateRecipe`.
3.  **Netlify Function (`/api/generateRecipe`):**
    *   Calls OpenAI API with the user's prompt and selected model (via `lib/openaiClient.js`).
    *   Receives recipe JSON from OpenAI.
    *   Saves recipe JSON, idea, model, status='completed' to `async_tasks` (using `lib/supabaseClient.js`).
    *   Returns `{ recipe: <json_object>, taskId: <new_task_id> }` to the frontend.
4.  **Frontend (`js/views/generateView.js` via `apiService.js`):**
    *   Receives the response.
    *   Calls `recipeListView.displayRecipe` to show the formatted recipe.
    *   Calls `fetchCostBreakdown` (within `generateView.js`) which calls `apiService.getCostBreakdown`.
5.  **Netlify Function (`/api/getCostBreakdown`):**
    *   Fetches recipe JSON from `async_tasks` using `task_id` (via `lib/supabaseClient.js`).
    *   Fetches prices from `ingredients` table (via `lib/supabaseClient.js`).
    *   Performs calculation using DB prices for known ingredients and falls back to AI estimation for unknown/failed ingredients (potentially using a hybrid approach, logic in `lib/costUtils.js`).
    *   Saves the final breakdown text and calculation type (e.g., 'db', 'ai', 'hybrid') to `async_tasks.cost_breakdown` (via `lib/supabaseClient.js`).
    *   Returns `{ breakdown: <text>, calculationType: <type> }` to the frontend.
6.  **Frontend (`js/views/generateView.js` via `apiService.js`):**
    *   Receives the breakdown response.
    *   Calls `recipeListView.displayCostBreakdown` to update the UI.

### B. View Saved Recipes

1.  **Frontend (`js/views/navigation.js`):** User clicks "Saved Recipes" nav button, `setActiveView('view-recipes')` is called.
2.  **Frontend (`js/views/navigation.js`):** Calls `recipeListView.loadRecipes`.
3.  **Frontend (`js/views/recipeListView.js`):** Calls `apiService.getRecipes`.
4.  **Netlify Function (`/api/getRecipes`):**
    *   Queries the `async_tasks` table for relevant records (potentially filtering/paginating) using `lib/supabaseClient.js`.
    *   Selects `task_id`, `recipe` (JSON), `cost_breakdown` (text), `created_at`, etc.
    *   Returns the list of recipe data.
5.  **Frontend (`js/views/recipeListView.js`):**
    *   Receives recipe list via `apiService.js`.
    *   Formats and renders the list items in the UI, attaching event listeners.

### C. Refine Recipe

1.  **Frontend (`js/views/recipeListView.js`):** User clicks "Refine" on a displayed recipe, enters refinement instructions.
2.  **Frontend (`js/views/recipeListView.js` - Event Listener):** Calls `handleRefineRecipe` which calls `apiService.refineRecipe`.
3.  **Netlify Function (`/api/refineRecipe`):**
    *   Fetches `recipe` (JSON) and `cost_breakdown` (text) from `async_tasks` using `recipeId` (via `lib/supabaseClient.js`).
    *   Constructs a detailed prompt for OpenAI including original recipe, existing breakdown, and user request (using `promptTemplates.js`).
    *   Calls OpenAI (`gpt-3.5-turbo` or `gpt-4o`) via `lib/openaiClient.js`.
    *   Receives the *combined* refined recipe + breakdown text from OpenAI.
    *   Updates `async_tasks`, overwriting the `cost_breakdown` column with the new combined text (via `lib/supabaseClient.js`).
    *   Returns `{ recipe: <refined_text> }` to the frontend.
4.  **Frontend (`js/views/recipeListView.js`):**
    *   Receives response via `apiService.js`.
    *   Displays the updated recipe/cost breakdown text in the specific recipe's refine section.

### D. Manage Ingredients (New)

1.  **Frontend (`js/views/navigation.js`):** User clicks "Ingrediënten Beheer" nav button, `setActiveView('view-ingredients')` is called.
2.  **Frontend (`js/views/navigation.js`):** Calls `ingredientView.loadIngredients`.
3.  **Frontend (`js/views/ingredientView.js`):**
    *   Calls `apiService.getIngredients` to fetch and display ingredients.
    *   User interacts with form/buttons:
        *   Add: Calls `handleAddIngredient` which calls `apiService.addIngredient`.
        *   Delete: Event listener calls `handleDeleteIngredient` which calls `apiService.deleteIngredient`.
4.  **Netlify Functions (`/api/*Ingredient`)**:
    *   Perform the requested CRUD operation on the `ingredients` table using `lib/supabaseClient.js`.
    *   Return success/failure status or updated data to the frontend.
5.  **Frontend (`js/views/ingredientView.js`):** Updates the displayed ingredient list/form feedback via `apiService.js` response.

### E. Clear All Saved Recipes (New)

1.  **Frontend (`js/views/recipeListView.js`):** User clicks "Alle Recepten Verwijderen" button.
2.  **Frontend (`js/views/recipeListView.js` - Event Listener):** Calls `handleClearAllRecipes` which calls `apiService.clearAllRecipes`.
3.  **Netlify Function (`/api/clearRecipes`):**
    *   Deletes all records from the `async_tasks` table using `lib/supabaseClient.js`.
    *   Returns success/failure status.
4.  **Frontend (`js/views/recipeListView.js`):** Calls `loadRecipes` again to refresh the (now empty) list.

## 3. Environment Variables

Ensure the following are configured correctly:

*   **Netlify (Site settings > Build & deploy > Environment):**
    *   `OPENAI_API_KEY`
    *   `SUPABASE_URL`
    *   `SERVICE_ROLE_KEY` (Supabase Service Role Key)
    *   `SUPABASE_ANON_KEY` (No longer directly used by backend functions)
*   ~~**GCP (GCF Deployment):**~~ (Removed)

## 4. Potential Improvements / Areas for Review

*   **Consolidate Platform:** (Done) Migrated `generateRecipe` from GCF to Netlify Functions.
*   **Eliminate Redundancy:** (Done) Removed `recipes` table, `calculateCost` GCF, and Cloud Scheduler Job.
*   **Standardize Key Usage:** (Done) Reviewed `/api/getRecipes` and updated it to use the Service Role Key for consistency. Backend functions now consistently use `lib/supabaseClient.js` which utilizes the Service Role Key.
*   **Share Helper Code:** (Done) Created `lib/` directory within `netlify/functions/`. Moved common helpers like `parseQuantityAndUnit`, `normalizeUnit`, `getConvertedQuantity` to `lib/costUtils.js`. Added `lib/openaiClient.js` and `lib/supabaseClient.js` for centralized client initialization. Helpers are imported where needed.
*   **Optimize AI Calls & Costs:** Review if the default model for generation/refinement (`gpt-4o-mini`?) is optimal. Consider fine-tuning prompts or exploring model choices further.
*   **Enhance Error Handling & Logging:** Implement more consistent error response formats across API functions and ensure logs capture sufficient context for debugging.
*   **Refine Unit Conversion:** Expand the `getConvertedQuantity` helper with more conversions (e.g., approximate volume units like 'el'/'tl' to 'ml') if needed based on common recipe formats.
*   **Improve Code Structure:** (Done) `frontend/script.js` has been refactored into multiple modules within `frontend/js/`. (Ongoing) Backend functions `getCostBreakdown.js` (~288 lines) and `lib/costUtils.js` (~357 lines) are larger and could be reviewed for further modularization.
*   **Investigate `generate.js`:** (New) The file `netlify/functions/generate.js` appears duplicative of `generateRecipe.js` but is referenced in some comments. Confirm which is correct/active and remove the unused file to avoid confusion.
*   **Investigate `get-processed-recipe.js`:** (New) The function `netlify/functions/get-processed-recipe.js` exists but isn't called by the frontend. Determine its purpose; document or remove it.
*   **Document New APIs:** (Done) Added documentation for ingredient management (`/api/*Ingredient`) and `/api/clearRecipes` endpoints and workflows.
