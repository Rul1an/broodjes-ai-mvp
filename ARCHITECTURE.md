# Broodjes App - Architecture Overview (As of May 2, 2024)

This document outlines the current technical architecture, component setup, and primary user workflows for the Broodjes App.

## 1. Core Components

The application is built using a combination of a static frontend, serverless functions (Netlify & Google Cloud), and a Supabase database backend.

*   **Frontend:**
    *   Files: `broodjes-app-vue/index.html`, `broodjes-app-vue/src/main.js` (entry point), `broodjes-app-vue/src/App.vue` (root component), `broodjes-app-vue/src/components/` (reusable UI components), `broodjes-app-vue/src/views/` (page-level components, indien gebruikt), `broodjes-app-vue/src/router/index.js` (Vue Router config), `broodjes-app-vue/src/services/apiService.js` (API communication). Potentially `broodjes-app-vue/public/` for static assets.
    *   Technology: Vue 3 (Composition API with `<script setup>`), Vite (build tool & dev server), Vue Router (for client-side routing). CSS can be scoped per component or global.
    *   Structure: Component-based architecture.
        *   `broodjes-app-vue/src/main.js`: Initializes the Vue app, mounts the root component, and sets up plugins (like Vue Router).
        *   `broodjes-app-vue/src/App.vue`: Main application shell, typically includes `<router-link>` for navigation and `<router-view>` to display routed components.
        *   `broodjes-app-vue/src/router/index.js`: Defines application routes and maps them to components (e.g., `GenerateView.vue`, `RecipeListView.vue`, `IngredientDbView.vue`).
        *   `broodjes-app-vue/src/services/apiService.js`: Handles all communication with the backend Netlify functions and GCFs. Methods return Promises and handle JSON parsing and basic error structuring.
        *   `broodjes-app-vue/src/components/`: Contains reusable UI elements (e.g., modals, buttons, specific parts of views).
        *   `broodjes-app-vue/src/views/` (or directly in `components/`): Contains components representing distinct pages or views (e.g., `GenerateView.vue`). These components manage their own state, logic, and use `apiService.js` for data fetching and mutations.
    *   Hosting: Netlify Static Site Hosting (serving files from `broodjes-app-vue/dist/` after build).
    *   Functionality: Handles user input via Vue's reactivity (`v-model`), displays data dynamically, triggers backend operations.
    *   **Caching:** Initial `sessionStorage` logic from Vanilla JS is being phased out. State management within Vue components (`ref`, `reactive`) is used. For more complex global state or cross-component caching, Pinia (or a similar Vue state management library) would be the recommended approach.
    *   **Error Handling:** Errors from `apiService.js` (which standardizes backend error responses) are caught within Vue components. User feedback is provided through reactive data properties bound to the template (e.g., displaying an error message if an `error` ref is populated).
    *   **UI Feedback:** Loading states (`isLoading` refs) are managed within components to disable buttons, show spinners, etc., leveraging Vue's conditional rendering (`v-if`, `v-show`) and attribute binding.

*   **Backend - Netlify Functions (`netlify/functions/`):**
    *   `/api/generate` (`generate.js` - **NEW/REPLACES OLD `/api/generateRecipe`**): Receives recipe generation parameters (theme, ingredients, style) from the Vue frontend. Retrieves `GCF_GENERATE_BROODJE_URL` and calls the `generateBroodjeRecipe` GCF. Returns the GCF's response (`{ taskId, recipe }`) to the frontend.
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
    *   `/api/triggerIngredientImageGeneration` (`triggerIngredientImageGeneration.js` - **NEW**): Receives `ingredient_id` and `ingredient_name`. Retrieves `GCF_IMAGE_GENERATION_URL` and calls the `generateIngredientImage` GCF to start image generation asynchronously. Returns a status indicating the GCF was triggered.
    *   `/api/startVisualizationTask` (`startVisualizationTask.js` - **NEW**): Receives `taskId`. Retrieves `GCF_VISUALIZE_BROODJE_URL` and calls the `visualizeBroodje` GCF to start image generation asynchronously. Returns a status indicating the GCF was triggered.
    *   `/api/getTaskStatus` (`getTaskStatus.js` - **NEW**): Receives `taskId`. Queries `async_tasks` table for `status` and `broodje_image_url` (or a dedicated visualization status). Returns `{ status: 'pending' | 'completed' | 'failed', imageUrl?: '...', error?: '...' }`.
    *   ~~`/api/getConfig` (`getConfig.js`):~~ (Potentially deprecated or less critical. GCF URLs are now primarily used by other Netlify Functions, which can access them directly from env vars. If Vue frontend needs specific GCF URLs directly, this could be kept, but current flows suggest backend-to-backend GCF calls.)

*   **Backend - Shared Libraries (`netlify/functions/lib/`):**
    *   `openaiClient.js`: Utility to initialize and provide the OpenAI API client.
    *   `supabaseClient.js`: Utility to initialize and provide the Supabase client (using Service Role Key).
    *   `unitUtils.js`: Contains helpers for parsing quantities/units, normalization, and conversion logic used by `/api/getCostBreakdown`.
    *   `aiCostUtils.js`: Contains helpers for AI-based cost estimation and extracting cost totals from AI responses, used by `/api/getCostBreakdown`. Uses caching via `cacheUtils.js`.
    *   `cacheUtils.js`: Provides functions (`generatePromptHash`, `getCachedOpenAIResponse`, `setCachedOpenAIResponse`) for caching OpenAI responses in the `openai_cache` Supabase table.
    *   ~~`costUtils.js`:~~ (Removed - Split into `unitUtils.js` and `aiCostUtils.js`)

*   **Backend - Google Cloud Functions (GCF):**
    *   `generateBroodjeRecipe` (`google-cloud-functions/gcf-generate-broodje/index.js`): Deployed in GCP. Receives `ingredients`, `type`, `model`, etc. via HTTP POST. Checks cache (`openai_cache` table), calls OpenAI API if miss, parses recipe JSON, saves recipe JSON, idea, model, status='completed' to `async_tasks`, returns `{ taskId: <new_task_id>, recipe: <json_object> }`. Requires CORS handling and appropriate env vars.
    *   `generateIngredientImage` (`google-cloud-functions/generate-ingredient-image/index.js`): Deployed in GCP. Receives `ingredient_id` and `ingredient_name` via HTTP POST. Calls OpenAI Image API to generate an image. Updates the corresponding `ingredients` record in Supabase with the `image_url`. Requires CORS handling and env vars.
    *   `visualizeBroodje` (`google-cloud-functions/gcf-visualize-broodje/index.js`): Deployed in GCP. Receives `taskId` via HTTP POST. Fetches recipe data, checks if `broodje_image_url` already exists. If not, calls OpenAI Image API (DALL-E 3) to generate an image of the sandwich. Updates the `async_tasks` record with the new `broodje_image_url`. Returns the `{ imageUrl }`. Requires CORS handling and env vars.

*   **Database (Supabase - PostgreSQL):**
    *   `async_tasks` table: Primary table tracking recipe generation. Stores `task_id` (UUID), initial idea (`prompt`), status (`status`), generated recipe JSON (`recipe`), final cost breakdown text (`cost_breakdown`), cost calculation type (`cost_calculation_type`), timestamps (`created_at`, `updated_at`), potentially a separate total cost (`estimated_cost`), and **`broodje_image_url`** (nullable URL for generated sandwich image).
    *   ~~`recipes` table:~~ (Removed - Redundant)
    *   `ingredients` table: Stores ingredient names, prices, units, and **image_url** (nullable URL for generated image).
    *   `openai_cache` table: Caches OpenAI API responses based on a hash of the request to reduce costs and latency.

*   **External Services:**
    *   **OpenAI API:** Used for recipe generation, refinement, cost estimation fallbacks, and **ingredient image generation** (DALL-E 3 / GPT-4o).
    *   **Netlify:** Hosts the Vue frontend (static build from `broodjes-app-vue/dist/`) and Netlify functions.
    *   **Google Cloud Platform (GCP):** Hosts the GCFs (`generateIngredientImage`, `generateBroodjeRecipe`, `visualizeBroodje`).

*   **Source Control & CI/CD:**
    *   **GitHub (`Rul1an/broodjes-ai-mvp`):** Hosts the codebase.
    *   **Netlify:** Deploys the Vue frontend and Netlify functions automatically on pushes to the connected branch (e.g., `Broodjes-ai-v2`).
        *   Build settings in Netlify UI should align with `netlify.toml`: base directory `broodjes-app-vue`, build command `npm run build`, publish directory `dist` (relative to base).
    *   GCF deployment is managed separately (e.g., via Google Cloud Console, gcloud CLI, or CI/CD pipelines specific to GCP if set up).

## 2. Primary Workflows

### A. Generate New Recipe

1.  **Frontend (Vue - `broodjes-app-vue/src/components/GenerateView.vue`):**
    *   User enters data into form fields (thema, extraIngredienten, stijl) which are bound to reactive refs (`thema`, `extraIngredienten`, `stijl`) using `v-model`.
    *   User clicks the "Genereer Broodje" button, which triggers the `handleGenerate` method (`@submit.prevent="handleGenerate"` on the form).
2.  **Frontend (`GenerateView.vue` - `handleGenerate` method):**
    *   Sets `isLoading` ref to `true` (disables button, shows loading indicator).
    *   Resets previous state (errors, recipe data, image URL, etc.) by calling `resetState()`.
    *   Calls `apiService.generateRecipe({ theme: thema.value, ... })`.
3.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `generateRecipe` function):**
    *   Makes a `POST` request to the `/api/generate` Netlify Function endpoint, sending the payload.
    *   Awaits the response. Handles potential network errors or non-JSON responses.
    *   If successful, returns the parsed JSON response (e.g., `{ recipe: { ... }, taskId: "..." }`).
    *   If error, throws a structured error object.
4.  **Netlify Function (`netlify/functions/generate.js` - voorheen `generateRecipe.js`):**
    *   Receives the request payload (theme, extra_ingredients, style).
    *   **Crucially, this function now needs to determine which GCF to call (the one that expects `theme`, `extra_ingredients`, `style`). This is likely `gcf-generate-broodje`.**
    *   Retrieves the `GCF_GENERATE_BROODJE_URL` from environment variables.
    *   Makes an HTTP POST request to the `generateBroodjeRecipe` GCF, forwarding the relevant payload.
    *   Receives the response from the GCF (which includes `taskId` and `recipe` object).
    *   Returns this GCF response (e.g., `{ recipe: <json_object>, taskId: <new_task_id> }`) to the Vue frontend.
5.  **GCF (`generateBroodjeRecipe` - `google-cloud-functions/gcf-generate-broodje/index.js`):**
    *   (Logic remains largely the same as previously documented)
    *   Checks cache in `openai_cache` table based on input payload.
    *   If cache miss: Calls OpenAI API with the user's prompt and selected model.
    *   Saves successful OpenAI response to cache.
    *   Parses recipe JSON from (cached or new) response.
    *   Saves recipe JSON, idea, model, status='completed' to `async_tasks`.
    *   Returns `{ recipe: <json_object>, taskId: <new_task_id> }` to the calling Netlify Function.
6.  **Frontend (`GenerateView.vue` - `handleGenerate` method cont.):**
    *   Receives the response from `apiService.generateRecipe`.
    *   Sets `generatedRecipe.value` and `currentTaskId.value`.
    *   Sets `currentRecipeTitle.value`.
    *   `formattedRecipe` computed property automatically updates to show the new recipe (using `marked.parse`).
    *   Sets `isLoading.value` to `false`.
    *   The "Visualiseer Broodje" button becomes available.
    *   (The old flow of immediately calling `fetchCostBreakdown` is removed here as cost breakdown is usually a separate step or handled differently).

### B. View Saved Recipes

1.  **Frontend (Vue Router & `App.vue`):** User clicks a navigation link (e.g., in `App.vue`) like `<router-link to="/recepten">Opgeslagen Recepten</router-link>`.
2.  **Frontend (Vue Router):** Vue Router navigates to the route configured for `/recepten`, which renders the `RecipeListView.vue` component (of hoe de view ook heet).
3.  **Frontend (`RecipeListView.vue` - e.g., in `onMounted` hook or a method called on view activation):**
    *   Sets a loading state (`isLoading.value = true`).
    *   Calls `apiService.getRecipes()`.
4.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `getRecipes` function):**
    *   Makes a `GET` request to the `/api/getRecipes` Netlify Function endpoint.
    *   Handles the response, returning parsed JSON (e.g., `{ recipes: [...] }`) or throwing a structured error.
5.  **Netlify Function (`netlify/functions/getRecipes.js`):**
    *   (Logic remains largely the same as previously documented)
    *   Queries the `async_tasks` table for relevant records.
    *   Returns the list of recipe data.
6.  **Frontend (`RecipeListView.vue`):**
    *   Receives the list of recipes (or error) from `apiService`.
    *   Stores the recipes in a reactive ref (e.g., `recipes.value = response.recipes`).
    *   Sets `isLoading.value = false`.
    *   The component's template uses `v-for` to iterate over the `recipes` ref and display each recipe, potentially in a child component (e.g., `RecipeCard.vue`). Event listeners for actions like 'Refine' or 'Visualize' would be attached here.

### C. Refine Recipe

1.  **Frontend (`RecipeListView.vue` or `RecipeCard.vue`):**
    *   User interacts with a specific recipe (e.g., clicks a "Refine" button associated with a recipe).
    *   A method is called, possibly opening a modal or an input area for refinement instructions. The `taskId` of the recipe is known.
2.  **Frontend (Method in Vue component):**
    *   User enters refinement instructions (e.g., into a `v-model` bound ref).
    *   On submission (e.g., another button click), the method calls `apiService.refineRecipe(taskId, refinementInstructions)`.
3.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `refineRecipe` function):**
    *   Makes a `POST` request to `/api/refineRecipe`, sending `{ taskId, instructions }`.
    *   Handles response and errors.
4.  **Netlify Function (`netlify/functions/refineRecipe.js`):**
    *   (Logic remains largely the same as previously documented)
    *   Fetches original recipe, calls OpenAI with refinement prompt, updates `async_tasks`.
    *   Returns the refined data (e.g., `{ recipe: <refined_text_or_object> }`).
5.  **Frontend (Vue component - callback/await from `apiService`):**
    *   Receives the refined recipe data.
    *   Updates the local state for that specific recipe to reflect the changes (e.g., by updating an item in the `recipes.value` array or a specific reactive object if viewing a detail page).
    *   The UI reactively updates to show the refined recipe.

### D. Manage Ingredients (New)

1.  **Frontend (Vue Router & `App.vue`):** User navigates to the ingredient management view (e.g., via `<router-link to="/ingredienten">`).
2.  **Frontend (Vue Router):** Renders the `IngredientDbView.vue` component (of hoe de view ook heet).
3.  **Frontend (`IngredientDbView.vue` - e.g., in `onMounted`):**
    *   Calls `apiService.getIngredients()` to load and display existing ingredients.
    *   Ingredients are stored in a reactive ref (e.g., `ingredients.value`) and displayed using `v-for`.
4.  **User Action (Add/Update Ingredient):**
    *   User fills a form (for new ingredient or editing an existing one). Data is bound with `v-model`.
    *   On submit, a method in `IngredientDbView.vue` calls `apiService.addIngredient(newIngredientData)` or `apiService.updateIngredient(ingredientId, updatedData)`.
5.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `addIngredient` / `updateIngredient` functions):**
    *   Make `POST` (for add) or `PUT` (for update) requests to `/api/addIngredient` or `/api/updateIngredient` Netlify Functions.
    *   Return the response (new/updated ingredient data) or throw an error.
6.  **Netlify Function (`netlify/functions/addIngredient.js` or `updateIngredient.js`):**
    *   (Logic remains largely the same: validation, DB insert/update).
    *   Returns the new or updated ingredient, including its `id` and `name`.
7.  **Frontend (`IngredientDbView.vue` - callback/await from `apiService`):**
    *   On successful add/update:
        *   Updates the local `ingredients.value` list reactively.
        *   Extracts `ingredient_id` and `ingredient_name` from the response.
        *   **Asynchronously calls `apiService.startIngredientImageGeneration(ingredient_id, ingredient_name)` (new function in `apiService`).**
8.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `startIngredientImageGeneration` function):**
    *   This function will now call a new Netlify Function, e.g., `/api/triggerIngredientImageGeneration`, sending `{ ingredient_id, ingredient_name }`.
    *   The purpose of this Netlify Function is to securely call the GCF, as GCF URLs and direct calls from the browser can be complex with auth/CORS if not proxied.
9.  **Netlify Function (`netlify/functions/triggerIngredientImageGeneration.js` - NEW):**
    *   Receives `{ ingredient_id, ingredient_name }`.
    *   Retrieves `GCF_IMAGE_GENERATION_URL` from environment variables.
    *   Makes an HTTP POST request to the `generateIngredientImage` GCF.
    *   It might not wait for the GCF to finish; it just triggers it. It can return a simple success/failure of the triggering action.
10. **GCF (`generateIngredientImage` - `google-cloud-functions/generate-ingredient-image/index.js`):**
    *   (Logic remains largely the same: receives ID/name, calls OpenAI Image API, updates `image_url` in Supabase `ingredients` table).
    *   **Note:** The frontend won't directly know when this is done unless it polls or Supabase Realtime is used to update the image in the UI when the `image_url` changes in the DB.
11. **User Action (Delete Ingredient):**
    *   User clicks a "Delete" button associated with an ingredient.
    *   A method in `IngredientDbView.vue` calls `apiService.deleteIngredient(ingredientId)`.
12. **Frontend (`broodjes-app-vue/src/services/apiService.js` - `deleteIngredient` function):**
    *   Makes a `DELETE` request to `/api/deleteIngredient` Netlify Function.
13. **Netlify Function (`netlify/functions/deleteIngredient.js`):**
    *   (Logic remains largely the same: deletes ingredient from Supabase).
14. **Frontend (`IngredientDbView.vue`):**
    *   On success, removes the ingredient from the local `ingredients.value` list, updating the UI reactively.

### E. Clear All Saved Recipes (New)

1.  **Frontend (`RecipeListView.vue` or a settings/admin view):**
    *   User clicks a "Alle Recepten Verwijderen" button.
    *   A confirmation modal/dialog should appear (using a Vue component, not `window.confirm()`).
2.  **Frontend (Vue component - on confirmation):**
    *   Calls `apiService.clearAllRecipes()`.
    *   Shows a loading state.
3.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `clearAllRecipes` function):**
    *   Makes a `POST` (or `DELETE`) request to `/api/clearRecipes` Netlify Function.
4.  **Netlify Function (`netlify/functions/clearRecipes.js`):**
    *   (Logic remains largely the same: deletes all records from `async_tasks`).
    *   Returns success/failure.
5.  **Frontend (Vue component - callback/await from `apiService`):**
    *   On success, clears the local `recipes.value` list (or triggers a re-fetch which will return an empty list).
    *   Hides loading state, potentially shows a success message.

### F. Visualize Broodje (New)

1.  **Frontend (`GenerateView.vue` or `RecipeCard.vue`):**
    *   User clicks "Visualiseer Broodje" button. This button is typically available after a recipe is generated (`currentTaskId.value` is set) or on a saved recipe card.
    *   The `handleVisualize` method is called.
2.  **Frontend (`GenerateView.vue` - `handleVisualize` method):**
    *   Sets `isVisualizing.value = true` (shows initial loading/triggering state).
    *   Resets previous visualization state (`pollingError`, `imageUrl`, stops any existing poll).
    *   Calls `apiService.visualizeRecipe(currentTaskId.value)` (this name might change, e.g., `startBroodjeVisualization`).
3.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `visualizeRecipe` / `startBroodjeVisualization` function):**
    *   Makes a `POST` request to a Netlify Function endpoint, e.g., `/api/visualizeBroodje` (or `/api/startVisualizationTask`), sending `{ taskId }`.
    *   This Netlify Function will be responsible for triggering the GCF.
    *   Returns a response indicating the triggering was successful (it doesn't return the image URL yet).
4.  **Netlify Function (`netlify/functions/visualizeBroodje.js` or `startVisualizationTask.js` - NEW or MODIFIED):**
    *   Receives `{ taskId }`.
    *   Retrieves `GCF_VISUALIZE_BROODJE_URL` from environment variables.
    *   Makes an HTTP POST request to the `visualizeBroodje` GCF, forwarding `{ taskId }`.
    *   The GCF will do its work asynchronously.
    *   This Netlify function returns a success status to the frontend, confirming the GCF has been *triggered*.
5.  **GCF (`visualizeBroodje` - `google-cloud-functions/gcf-visualize-broodje/index.js`):**
    *   (Logic remains largely the same: receives taskId, fetches recipe, calls DALL-E, updates `async_tasks.broodje_image_url`).
    *   **Important:** This GCF does *not* directly return the image URL to the original caller (the Netlify Function in step 4). It just does its work and updates the database.
6.  **Frontend (`GenerateView.vue` - `handleVisualize` method cont.):**
    *   Sets `isVisualizing.value = false` (triggering is done).
    *   If triggering was successful, calls `startPolling()` method within the component.
7.  **Frontend (`GenerateView.vue` - `startPolling` and `pollStatus` methods):**
    *   `startPolling()`: Sets `isPolling.value = true`. Calls `pollStatus()` immediately and then sets an interval (`setInterval`) to call `pollStatus` periodically (e.g., every 3-5 seconds).
    *   `pollStatus()`:
        *   Calls `apiService.getTaskStatus(currentTaskId.value)`.
8.  **Frontend (`broodjes-app-vue/src/services/apiService.js` - `getTaskStatus` function - NEW):**
    *   Makes a `GET` request to a new Netlify Function endpoint, e.g., `/api/getTaskStatus?taskId=<taskId>`.
9.  **Netlify Function (`netlify/functions/getTaskStatus.js` - NEW):**
    *   Receives `taskId` from query parameter.
    *   Queries the `async_tasks` table in Supabase for the given `taskId`.
    *   Checks the `status` and `broodje_image_url` (or a dedicated visualization status field if you add one).
    *   Returns a JSON response like `{ status: 'pending' }`, `{ status: 'completed', imageUrl: '...' }`, or `{ status: 'failed', error: '...' }`.
10. **Frontend (`GenerateView.vue` - `pollStatus` method cont.):**
    *   Receives the status from `apiService.getTaskStatus`.
    *   If `status === 'completed'`:
        *   Sets `imageUrl.value = response.imageUrl`.
        *   Calls `stopPolling()` (which clears the interval and sets `isPolling.value = false`).
    *   If `status === 'failed'`:
        *   Sets `pollingError.value` with the error details.
        *   Calls `stopPolling()`.
    *   If `status === 'pending'`: Does nothing, the interval will call `pollStatus` again.
11. **Frontend (`GenerateView.vue` - template):**
    *   Reactively displays the image if `imageUrl.value` is set.
    *   Shows loading/polling indicators based on `isPolling.value`.
    *   Shows errors based on `pollingError.value`.

## 3. Environment Variables & Configuration

Ensure the following are configured correctly:

*   **Vue Frontend (broodjes-app-vue/):**
    *   Uses `.env.[mode]` files (e.g., `.env.development`, `.env.production`) for environment-specific variables.
    *   Variables must be prefixed with `VITE_` to be exposed to the client-side code (e.g., `VITE_API_BASE_URL="/api"`).
    *   During `netlify dev`, these can be supplemented or overridden by variables in `netlify.toml` or the Netlify UI.

*   **Netlify (Site settings > Build & deploy > Environment & netlify.toml):**
    *   `OPENAI_API_KEY`: Used by Netlify Functions and GCFs.
    *   `SUPABASE_URL`: Used by Netlify Functions and GCFs.
    *   `SUPABASE_SERVICE_KEY`: Used by Netlify Functions and GCFs for privileged operations.
    *   `SUPABASE_ANON_KEY`: Potentially used by the Vue frontend if direct Supabase calls were ever made (currently all via backend).
    *   `GCF_IMAGE_GENERATION_URL`: URL for the `generateIngredientImage` GCF. Made available to Netlify Functions.
    *   `GCF_GENERATE_BROODJE_URL`: URL for the `generateBroodjeRecipe` GCF. Made available to Netlify Functions.
    *   `GCF_VISUALIZE_BROODJE_URL`: URL for the `visualizeBroodje` GCF. Made available to Netlify Functions.
    *   Environment variables defined here are available to Netlify Functions at runtime and to the build process of the Vue app (if not prefixed with `VITE_`, they are build-time only for the frontend unless explicitly passed).

*   **GCP (Environment Variables for GCFs):**
    *   Requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY` for all GCFs.
    *   Optionally `ALLOWED_ORIGIN` for CORS configuration if GCFs are called directly from the browser (currently GCFs are mostly called by Netlify Functions, reducing direct browser CORS needs for GCFs).

*   **`netlify.toml` (in project root `/Users/roelschuurkes/BROODJESAPP/`):**
    *   `[build]`: Defines `command = "npm run build"`, `base = "broodjes-app-vue"`, `publish = "broodjes-app-vue/dist"`, and `functions = "netlify/functions"`.
    *   `[dev]`: Defines `command = "npm run dev"` (for Vite), `targetPort` (for Vite dev server, e.g., 5173), `framework = "#vite"`, `functions = "netlify/functions"`, and `publish = "broodjes-app-vue/dist"`.
    *   This file is crucial for `netlify dev` to correctly serve the Vue app and Netlify functions together, and for Netlify to build and deploy the site correctly.

## 4. Potential Improvements / Areas for Review (Post Vue.js Migration)

This section tracks areas identified for potential improvement or further investigation based on the **current Vue 3 architecture**.

**Recently Completed (Primarily during/due to Vue Migration):**

*   **Frontend Migration to Vue 3:** Core application frontend rebuilt with Vue 3, Vite, and Vue Router.
*   **Refactored API Service:** `apiService.js` created within the Vue app (`broodjes-app-vue/src/services/`) for handling calls to Netlify Functions.
*   **Client-Side Routing:** Implemented with `vue-router`.
*   **Component-Based UI:** Initial versions of `GenerateView.vue`, `RecipeListView.vue`, `IngredientDbView.vue` created.
*   **Asynchronous Task Handling for Visualization:** Implemented polling mechanism in `GenerateView.vue` to check image generation status via new Netlify Functions (`/api/startVisualizationTask`, `/api/getTaskStatus`).
*   **Netlify Dev Setup:** Configured `netlify.toml` for local development (proxying Vite and Netlify Functions) and for production build settings.
*   **Revised Workflows:** Documented how user flows interact with Vue components and the updated backend invocation patterns (Netlify Function calls GCF).
*   **Environment Variable Handling:** Clarified usage of `.env` files for Vite and Netlify environment variables.

**Active / To-Do (Post-Vue Migration):**

*   **Complete UI/UX for all Views:**
    *   Flesh out `RecipeListView.vue` and `IngredientDbView.vue` with full functionality (display, add, edit, delete where applicable).
    *   Implement custom modals (e.g., using Vue Teleport or a library) to replace `window.confirm()` and for image display.
    *   Ensure consistent error display and loading states across all views.

*   **State Management (Vue):**
    *   For simple cases, `ref` and `reactive` are sufficient.
    *   **(Next) Evaluate Need for Pinia:** If global state (e.g., user authentication, shared configuration, complex cross-component data) becomes necessary, integrate Pinia.
    *   Revisit `apiService.js` caching: Currently no client-side caching. If GCF/Netlify Function responses are cacheable and frequently requested, consider a simple in-memory cache in `apiService.js` or integrate with Pinia state.

*   **Backend Function Adjustments (Post-Vue Migration):**
    *   **Verify GCF Invocation:** Ensure all Netlify functions correctly call GCFs and handle environment variables for GCF URLs.
    *   **Review `getConfig.js`:** Decide if `/api/getConfig` is still needed. If all GCF URLs are handled backend-to-backend by Netlify Functions, this might be removable. If the Vue app ever needs a GCF URL directly (less ideal), it could stay.

*   **Optimize AI Calls & Costs:** (Remains relevant)
    *   Review prompt engineering.
    *   Server-side caching in `openai_cache` table via `cacheUtils.js` is implemented and should be maintained/monitored.
    *   Evaluate model choices.

*   **Enhance Error Handling & Logging:** (Backend part remains relevant)
    *   **(Next) Improve Backend Logging:** Ensure all `catch` blocks in Netlify Functions and GCFs log the *full* error object (including stack trace) server-side for better debugging.

*   **Address Function Timeouts (Netlify Free Tier):** (Strategy of using GCFs for long tasks is sound)
    *   The GCF-based approach for recipe generation, ingredient image generation, and broodje visualization is the correct strategy for handling Netlify's 10s timeout.

*   **Input Validation:** (Frontend part needs more focus)
    *   **(Next)** Add comprehensive frontend input validation in all forms (Vue components) before calling `apiService.js`.

*   **Testing:**
    *   **(Next)** Implement unit tests for Vue components and `apiService.js` using Vitest or Jest.
    *   **(Next)** Consider end-to-end tests for key user flows using Cypress or Playwright.

## 5. Improvement Plan (Post Vue.js Migration)

This section outlines planned steps, focusing on completing and refining the Vue application.

**Fase 1: Complete Core Vue Functionality & UI**

*   **Stap 1: Finalize `RecipeListView.vue`**
    *   Display saved recipes with details.
    *   Implement 'Refine' and 'Visualize Broodje' (polling) functionality on recipe cards.
    *   Implement 'Clear All Recipes' with confirmation modal.
*   **Stap 2: Finalize `IngredientDbView.vue`**
    *   Display ingredients, including their generated images (if available, consider placeholder).
    *   Implement Add, Update, Delete functionality with forms/modals.
    *   Ensure asynchronous image generation is triggered and UI updates (e.g., shows a spinner or placeholder until image appears, or refreshes periodically).
*   **Stap 3: Implement Custom Modals**
    *   Replace all `window.confirm()` calls.
    *   Use a consistent modal component for image display, confirmations, and potentially forms.
*   **Stap 4: Comprehensive Frontend Input Validation**
    *   Add validation to all user input fields.
*   **Stap 5: Thorough UI/UX Testing and Refinement**
    *   Test all user flows.
    *   Ensure consistent loading states and error messages.

**Fase 2: Backend Refinements & Advanced Features**

*   **Stap 6: Verify and Refine Backend GCF Triggers**
    *   Ensure all Netlify functions correctly call GCFs and handle environment variables for GCF URLs.
    *   Decide on the fate of `/api/getConfig`.
*   **Stap 7: Enhance Backend Logging**
    *   Implement detailed server-side logging for all Netlify Functions and GCFs.
*   **Stap 8: Consider Supabase Realtime for Image Updates**
    *   For `IngredientDbView.vue` and `GenerateView.vue` (broodje visualization), explore Supabase Realtime to update the UI instantly when an `image_url` changes in the database, instead of relying on manual refresh or assumptions about GCF completion time.

**Fase 3: Testing & Optimization**

*   **Stap 9: Implement Unit & E2E Tests**
*   **Stap 10: Performance Review & Optimization**
    *   Review Vue app bundle size, component rendering performance.
    *   Monitor AI call costs and caching effectiveness.
