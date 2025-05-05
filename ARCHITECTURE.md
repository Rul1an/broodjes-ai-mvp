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
        *   `js/views/generateView.js`: Handles logic for the recipe generation form, including **passing the selected AI model** to the backend.
        *   `js/views/recipeListView.js`: Handles displaying, loading, refining, and clearing saved recipes.
        *   `js/views/ingredientView.js`: Handles displaying and managing ingredients.
    *   Hosting: Netlify Static Site Hosting
    *   Functionality: Handles user input, displays data, triggers backend operations via API calls organized in modules.
    *   **Caching:** Gebruikt `sessionStorage` om de resultaten van `getIngredients` en `getRecipes` te cachen. Cache wordt automatisch geïnvalideerd bij relevante mutaties (toevoegen/verwijderen/genereren/refinen).
    *   **Error Handling:** Vangt errors van `apiService` op, toont gebruikersvriendelijke meldingen via `uiUtils.displayErrorToast`.
    *   **UI Feedback:** Gebruikt laadindicatoren (spinners) en schakelt knoppen uit tijdens API-calls.

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
    *   `/api/getConfig` (`getConfig.js`): Returns configuration values, specifically the `GCF_IMAGE_GENERATION_URL`, to the frontend.

*   **Backend - Shared Libraries (`netlify/functions/lib/`):**
    *   `openaiClient.js`: Utility to initialize and provide the OpenAI API client.
    *   `supabaseClient.js`: Utility to initialize and provide the Supabase client (using Service Role Key).
    *   `unitUtils.js`: Contains helpers for parsing quantities/units, normalization, and conversion logic used by `/api/getCostBreakdown`.
    *   `aiCostUtils.js`: Contains helpers for AI-based cost estimation and extracting cost totals from AI responses, used by `/api/getCostBreakdown`. Uses caching via `cacheUtils.js`.
    *   `cacheUtils.js`: Provides functions (`generatePromptHash`, `getCachedOpenAIResponse`, `setCachedOpenAIResponse`) for caching OpenAI responses in the `openai_cache` Supabase table.
    *   ~~`costUtils.js`:~~ (Removed - Split into `unitUtils.js` and `aiCostUtils.js`)

*   **Backend - Google Cloud Functions (GCF):**
    *   ~~`gcf-generate-recipe/index.js` (Deployed as `generateRecipe`):~~ (Removed - Logic migrated to Netlify Function `/api/generateRecipe`)
    *   ~~`gcf-calculate-cost/index.js` (Deployed as `calculateCost`):~~ (Removed - Functionality covered by `/api/getCostBreakdown`)
    *   `generateIngredientImage` (`google-cloud-functions/generate-ingredient-image/index.js`): Deployed in GCP. Receives `ingredient_id` and `ingredient_name` via HTTP POST. Calls OpenAI Image API to generate an image. Updates the corresponding `ingredients` record in Supabase with the `image_url`.

*   **Database (Supabase - PostgreSQL):**
    *   `async_tasks` table: Primary table tracking recipe generation. Stores `task_id` (UUID), initial idea (`prompt`), status (`status`), generated recipe JSON (`recipe`), final cost breakdown text (`cost_breakdown`), cost calculation type (`cost_calculation_type`), timestamps (`created_at`, `updated_at`), and potentially a separate total cost (`estimated_cost`).
    *   ~~`recipes` table:~~ (Removed - Redundant)
    *   `ingredients` table: Stores ingredient names, prices, units, and **image_url** (nullable URL for generated image).
    *   `openai_cache` table: Caches OpenAI API responses based on a hash of the request to reduce costs and latency.

*   **External Services:**
    *   **OpenAI API:** Used for recipe generation, refinement, cost estimation fallbacks, and **ingredient image generation** (DALL-E 3 / GPT-4o).
    *   **Netlify:** Hosts the frontend and Netlify functions.
    *   **Google Cloud Platform (GCP):** Hosts the `generateIngredientImage` Cloud Function.

*   **Source Control & CI/CD:**
    *   **GitHub (`Rul1an/broodjes-ai-mvp`):** Hosts the codebase.
    *   **Netlify:** Deploys frontend and Netlify functions automatically on pushes to the connected branch (e.g., `Broodjes-ai-v2`).
    *   ~~**GitHub Actions (`.github/workflows/`):** Deploys GCFs (`calculateCost`) on pushes to the relevant branch.~~ (Removed - GCF deployment no longer needed, review workflow file if it exists)

## 2. Primary Workflows

### A. Generate New Recipe

1.  **Frontend:** User enters ingredients/idea, selects model (`gpt-4o` or `gpt-4o-mini`), clicks "Generate".
2.  **Frontend (`js/views/generateView.js`):** Calls `apiService.generateRecipe` (passing user idea as `ingredients` and the **selected `model`**).
3.  **Netlify Function (`/api/generateRecipe`):**
    *   Checks cache based on input (ingredients, model, prompts).
    *   If cache miss: Calls OpenAI API with the user's prompt and selected model (via `lib/openaiClient.js`).
    *   Saves successful OpenAI response to cache.
    *   Parses recipe JSON from (cached or new) response.
    *   Saves recipe JSON, idea, model, status='completed' to `async_tasks`.
    *   Returns `{ recipe: <json_object>, taskId: <new_task_id> }`.
4.  **Frontend (`js/views/generateView.js` via `apiService.js`):**
    *   Receives the response.
    *   Calls `recipeListView.displayRecipe` to show the formatted recipe.
    *   Calls `fetchCostBreakdown` (within `generateView.js`) which calls `apiService.getCostBreakdown`.
5.  **Netlify Function (`/api/getCostBreakdown`):**
    *   Fetches recipe JSON and ingredient data (including `image_url`).
    *   Performs cost calculation (DB/AI/Hybrid).
    *   Formats breakdown text, **including `<img>` tags for ingredients with an `image_url`**.
    *   Saves and returns the breakdown.
6.  **Frontend (`js/views/generateView.js` via `apiService.js`):**
    *   Receives breakdown response.
    *   Calls `recipeListView.displayCostBreakdown` which renders the HTML (including images) using `marked.parse`.

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

1.  **Frontend:** User navigates to ingredient management.
2.  **Frontend (`ingredientView.js`):** Loads and displays ingredients.
3.  **User Action (Add/Update):**
    *   User fills form, clicks Add/Update.
    *   Frontend (`ingredientView.js`) calls `/api/addIngredient` or `/api/updateIngredient`.
4.  **Netlify Function (`/api/addIngredient` or `/api/updateIngredient`):**
    *   Performs validation.
    *   Inserts/Updates ingredient in Supabase `ingredients` table.
    *   Returns success (with the new/updated ingredient data) or failure to frontend.
5.  **Frontend (`ingredientView.js`):**
    *   Receives successful response from `add/update`.
    *   Extracts `ingredient_id` and `ingredient_name`.
    *   Fetches GCF URL using `/api/getConfig` (if not already fetched).
    *   Asynchronously calls the `generateIngredientImage` GCF URL via `fetch` (POST), passing the ID and name.
6.  **GCF (`generateIngredientImage`):**
    *   Receives request with ID and name.
    *   Calls OpenAI Image API.
    *   Updates the `image_url` in the Supabase `ingredients` table for the given ID.
7.  **User Action (Delete):** (Renumbered)
    *   User clicks Delete.
    *   Frontend (`ingredientView.js`) calls `/api/deleteIngredient`.
8.  **Netlify Function (`/api/deleteIngredient`):** (Renumbered) Deletes ingredient from Supabase.
9.  **Frontend:** (Renumbered) Updates UI based on success/failure.

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
    *   `SUPABASE_SERVICE_KEY` (Supabase Service Role Key)
    *   `GCF_IMAGE_GENERATION_URL` (URL for the deployed `generateIngredientImage` GCF)
    *   `SUPABASE_ANON_KEY` (Used by Supabase client library, though potentially not directly by backend functions anymore)
*   **GCP (Environment Variables for `generateIngredientImage` GCF):**
    *   `SUPABASE_URL`
    *   `SUPABASE_SERVICE_KEY`
    *   `OPENAI_API_KEY`

## 4. Potential Improvements / Areas for Review

This section tracks areas identified for potential improvement or further investigation.

**Completed:**

*   **Consolidate Platform:** Migrated frontend and backend functions to Netlify.
*   **Eliminate Redundancy:** Removed separate Express server.
*   **Share Helper Code:** Centralized Supabase and OpenAI client initialization in `netlify/functions/lib`.
*   **Document New APIs:** Added documentation for `generateRecipe`, `refineRecipe`, `clearRecipes`, `getCostBreakdown`.

**Active / To-Do:**

*   **Standardize Client/Key Usage:**
    *   **(Done)** Verified all backend functions consistently use shared clients (`lib/supabaseClient.js`, `lib/openaiClient.js`).
    *   **(Done)** Reviewed key usage; Service Role Key is used by shared Supabase client.

*   **Optimize AI Calls & Costs:**
    *   Review prompt engineering for efficiency and quality across `generateRecipe`, `refineRecipe`, and `getCostBreakdown`.
    *   Consider caching identical requests (e.g., generating a recipe for the exact same ingredients multiple times) to reduce redundant OpenAI calls.
    *   Evaluate if cheaper/faster OpenAI models are sufficient for certain tasks.

*   **Enhance Error Handling & Logging:**
    *   **(Done) Standardize Backend Error Responses:** All Netlify functions now return a consistent JSON structure (`{ error: { message, code, details } }`) upon failure, including appropriate HTTP status codes.
    *   **(Done) Implement Frontend Error Display:** Modified `apiService.js` to parse the standardized error response. View modules now use the error payload (`errorPayload.message`) to display user-friendly feedback via `uiUtils.displayErrorToast`.
    *   **(Next) Improve Backend Logging:** Ensure all `catch` blocks log the *full* error object (including stack trace) server-side for better debugging.

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
    *   **(Done)** Improve Loading/Feedback.
    *   **(Partially Done) Ingredient Image Display:** Backend setup complete (GCF, trigger, DB update, cost breakdown includes `<img>`). Frontend rendering works via `marked.parse`. *Needs more robust testing, placeholder/error state handling in UI.*
    *   **(Next)** Dedicated "Visualiseer Broodje" button and associated GCF/workflow.
    *   **(Next)** Replace `confirm()` with custom modal.

*   **Input Validation:**
    *   **(Done)** Reviewed backend functions (`add`, `update`, `delete` ingredient); validation for required fields and types is present.
    *   **(Next)** Add stricter input validation on the *frontend* (e.g., check for numbers in price field before sending) and consider backend validation for `generateRecipe`/`refineRecipe` inputs.

*   **Investigate Unused/Redundant Code:**
    *   **(Done)** Reviewed and removed `generate.js` and `get-processed-recipe.js`.

*   **Stap 9: Implementeer OpenAI Request Caching (Server-side) (Done)**
    *   **Doel:** Verminder onnodige OpenAI calls en kosten.
    *   **Actie:** Database caching geïmplementeerd via `cacheUtils.js` en `openai_cache` tabel. Functies `generateRecipe`, `refineRecipe`, en AI helpers in `aiCostUtils` checken nu de cache en slaan nieuwe resultaten op.
*   **Stap 10: Implementeer Asynchrone Beeldgeneratie Ingredienten (Done)**
    *   **Doel:** Voeg afbeeldingen toe aan ingrediënten zonder de UI te blokkeren.
    *   **Actie:** Setup GCF met CORS. Frontend (`ingredientView.js`) triggert GCF *direct* via `fetch` na succesvolle toevoeging/update via `/api/addIngredient` of `/api/updateIngredient`. GCF updatet `image_url` in Supabase `ingredients` tabel. `/api/getConfig` levert GCF URL aan frontend. *Volgende: Testen image display in `getCostBreakdown`, evt. placeholders, "Visualiseer Broodje" knop.*

## 5. Improvement Plan (Phased Approach - TEMP)

This section outlines the planned steps for implementing improvements.

**Fase 1: Fundamenten en Directe Gebruikerservaring (Completed)**

*   **Stap 1: Standaardiseer Backend Error Responses (Done)**
    *   Alle Netlify functions retourneren nu `{ error: { message, code, details } }`.
*   **Stap 2: Implementeer Frontend Error Weergave (Done)**
    *   `apiService.js` parseert de gestandaardiseerde error.
    *   View modules gebruiken `uiUtils.displayErrorToast(errorPayload.message)`.
*   **Stap 3: Verbeter UI Feedback (Loading & Knoppen) (Done)**
    *   Loading indicators vervangen door spinners.
    *   Actieknoppen gebruiken `setButtonLoading` voor disabled states.

**Fase 2: Optimalisaties en Refactoring**

*   **Stap 4: Implementeer Client-Side Caching voor Ingrediënten (Done)**
    *   **Doel:** Voorkom onnodig ophalen van de ingrediëntenlijst.
    *   **Actie:** Gebruik `sessionStorage` in `apiService.js` voor ingrediënten en recepten.
*   **Stap 5: Verbeter Backend Logging (Done)**
    *   **Doel:** Betere debugging mogelijkheden.
    *   **Actie:** Zorg dat alle `catch` blokken in backend functies de volledige error (incl. stack trace) loggen via `console.error(error);`.
*   **Stap 6: Voeg Frontend Input Validatie toe (Done)**
    *   **Doel:** Voorkom ongeldige API calls.
    *   **Actie:** Prijsvalidatie (non-negatief getal) toegevoegd in `ingredientView.js`.
*   **Stap 7: Refactor Backend Utilities (`costUtils.js`) (Done)**
    *   **Doel:** Verbeter structuur/onderhoudbaarheid.
    *   **Actie:** `costUtils.js` opgesplitst in `unitUtils.js` (parsing/normalisatie/conversie) en `aiCostUtils.js` (AI helpers & extractie). Oude/redundante helpers verwijderd.
*   **Stap 8: Refactor Backend Hoofdlogica (`getCostBreakdown.js`) (Done)**
    *   **Doel:** Verbeter leesbaarheid.
    *   **Actie:** Logica voor DB-only, AI-only, en Hybrid scenario's geëxtraheerd naar interne helper functies binnen `getCostBreakdown.js`.

**Fase 3: Geavanceerde Optimalisatie & Features (Next)**

*   **Stap 9: Implementeer OpenAI Request Caching (Server-side) (Done)**
    *   **Doel:** Verminder onnodige OpenAI calls en kosten.
    *   **Actie:** Database caching geïmplementeerd via `cacheUtils.js` en `openai_cache` tabel. Functies `generateRecipe`, `refineRecipe`, en AI helpers in `aiCostUtils` checken nu de cache en slaan nieuwe resultaten op.
*   **Stap 10: Implementeer Asynchrone Beeldgeneratie Ingredienten (Done)**
    *   **Doel:** Voeg afbeeldingen toe aan ingrediënten zonder de UI te blokkeren.
    *   **Actie:** Setup GCF met CORS. Frontend (`ingredientView.js`) triggert GCF *direct* via `fetch` na succesvolle toevoeging/update via `/api/addIngredient` of `/api/updateIngredient`. GCF updatet `image_url` in Supabase `ingredients` tabel. `/api/getConfig` levert GCF URL aan frontend. *Volgende: Testen image display in `getCostBreakdown`, evt. placeholders, "Visualiseer Broodje" knop.*
