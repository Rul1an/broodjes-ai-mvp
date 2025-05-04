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
        *   Receives `ingredients` (user idea) and `model` from frontend (type is hardcoded to 'broodje').
        *   Calls OpenAI API (model selected by user or default) to generate recipe JSON.
        *   Saves the recipe JSON, idea, status ('completed'), model to the `async_tasks` table.
        *   Uses Supabase **Service Role Key** for database write.
        *   Returns `{ taskId: <new_task_id>, recipe: <json_object> }` with `Content-Type: application/json` header.
    *   `/api/getRecipes` (`getRecipes.js`): Fetches saved recipe data (recipe JSON, cost breakdown text, etc.) from the Supabase `async_tasks` table.
        *   Selects completed tasks with non-null recipes.
        *   Maps DB fields to frontend keys (`id`, `generated_recipe`, `cost_breakdown`, etc.).
        *   Uses Supabase **Service Role Key**.
        *   Returns `{ recipes: [...] }` with `Content-Type: application/json` header.
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
        *   Returns `{ breakdown: <text>, calculationType: <type> }` with `Content-Type: application/json` header.
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
2.  **Frontend (`js/views/generateView.js`):** Calls `apiService.generateRecipe` (passing user idea as `ingredients`, selected `model`, and hardcoded `type='broodje'`).
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

This section tracks areas identified for potential improvement or further investigation.

**Completed:**

*   **Consolidate Platform:** Migrated frontend and backend functions to Netlify.
*   **Eliminate Redundancy:** Removed separate Express server.
*   **Share Helper Code:** Centralized Supabase and OpenAI client initialization in `netlify/functions/lib`.
*   **Document New APIs:** Added documentation for `generateRecipe`, `refineRecipe`, `clearRecipes`, `getCostBreakdown`.

**Active / To-Do:**

*   **Standardize Client/Key Usage:**
    *   **Ensure consistent use of shared clients:** Verify *all* backend functions correctly import and use the factory functions from `lib/supabaseClient.js` (i.e., `getServiceClient()`) and the client from `lib/openaiClient.js`. The recent fix in `getIngredients.js` highlighted the importance of correct pathing and calling the factory function.
    *   Review key usage: Double-check no keys (Anon vs. Service Role) are used inappropriately across functions.

*   **Optimize AI Calls & Costs:**
    *   Review prompt engineering for efficiency and quality across `generateRecipe`, `refineRecipe`, and `getCostBreakdown`.
    *   Consider caching identical requests (e.g., generating a recipe for the exact same ingredients multiple times) to reduce redundant OpenAI calls.
    *   Evaluate if cheaper/faster OpenAI models are sufficient for certain tasks.

*   **Enhance Error Handling & Logging:**
    *   **(Done) Standardize Backend Error Responses:** All Netlify functions now return a consistent JSON structure (`{ error: { message, code, details } }`) upon failure, including appropriate HTTP status codes.
    *   **(Next) Implement Frontend Error Display:** Modify `apiService.js` to parse the standardized error response. Implement a user-friendly display mechanism (e.g., toast notification via `uiUtils.js`) in the view modules (`generateView`, `ingredientView`, `recipeListView`) to show the `error.message` to the user instead of just logging to the console.
    *   **(Backend) Improve Logging:** Ensure all `catch` blocks log the *full* error object (including stack trace) server-side for better debugging.

*   **Improve Code Structure & Readability:**
    *   **(Next - Optional/Larger) Refactor Backend Utilities (`costUtils.js`):** Split the large `costUtils.js` into smaller, more focused modules (e.g., `unitConversion.js`, `quantityParsing.js`, `aiCostHelpers.js`) and update `require` statements in `getCostBreakdown.js`.
    *   **(Next - Optional/Larger) Refactor Backend Main Logic (`getCostBreakdown.js`):** Improve readability by extracting the logic for DB-only, AI-fallback, and Hybrid scenarios into separate internal helper functions within `getCostBreakdown.js`.
    *   Review Vanilla JS structure: Evaluate if the current view/service separation is sufficient or if a slightly more structured approach (e.g., simple state management pattern) could simplify UI updates and data flow, especially with added complexity.

*   **Address Function Timeouts (Netlify Free Tier):**
    *   The 10-second timeout remains a constraint for potentially long-running operations (complex recipe generation, future image generation).
    *   **Mitigation for Existing Features:** Optimize existing AI calls as much as possible.
    *   **Strategy for New Features (Image Generation):** Image generation *cannot* reliably run within the 10s limit on Netlify free tier. The proposed solution is to use **Google Cloud Functions (GCF)** triggered asynchronously.
        *   The frontend would call a quick Netlify function to initiate the GCF task.
        *   The GCF would perform the image generation and store the result (e.g., in Supabase).
        *   The frontend would poll or use a mechanism (like Supabase Realtime) to know when the image is ready.

*   **UI/UX Enhancements:**
    *   **(Next) Improve Loading/Feedback:** Replace text indicators with a visual spinner/animation via `uiUtils.js`. Ensure all action buttons have clear `disabled` states during API calls and provide brief visual success feedback (e.g., toast).
    *   **(Next - Optional) Implement Client-Side Ingredient Caching:** Modify `ingredientView.js` to use `sessionStorage` to cache the ingredient list, reducing API calls. Add a manual refresh button.
    *   **Dedicated Image Generation Button:** Add a button (e.g., "Visualiseer Broodje") that appears *after* a recipe is successfully generated. Clicking this button would trigger the asynchronous image generation process (likely via GCF).
    *   **Ingredient Image Display:** Implement the idea for showing ingredient images during cost breakdown:
        *   Add an `image_url` (nullable) column to the `ingredients` table in Supabase.
        *   Modify the "Add Ingredient" / "Update Ingredient" backend logic: When an ingredient is added/updated, asynchronously trigger a GCF to generate an image using the ingredient name as a prompt (using the OpenAI Image API - gpt-4o or dall-e-3). Store the resulting image URL in the new `image_url` column. Use a placeholder/default if generation fails.
        *   Modify the `getCostBreakdown` logic (or frontend rendering) to fetch and display these images alongside ingredient names. If an image URL exists, use it; otherwise, show a default/placeholder.

*   **Input Validation:** Add stricter input validation on both the frontend (before sending API requests) and backend (within Netlify functions) to prevent errors and ensure data integrity.

*   **Investigate Unused/Redundant Code:**
    *   **(Done)** Reviewed and removed `generate.js` and `get-processed-recipe.js`.
