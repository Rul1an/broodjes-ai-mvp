<template>
  <div v-if="recipe" class="recipe-display">
    <h3>Gegenereerd Recept:</h3>

    <div class="recipe-content">
      <div v-if="formattedRecipe" class="recipe-text" v-html="formattedRecipe"></div>
      <div v-else class="recipe-placeholder">
        Recept inhoud niet beschikbaar
      </div>
    </div>

    <!-- Advanced Cost Breakdown Section -->
    <div class="cost-breakdown-section">
      <div class="cost-actions">
        <button
          @click="handleGetCostBreakdown"
          v-if="!costBreakdown && !isCurrentTaskLoading"
          :disabled="!taskId"
          class="cost-btn"
        >
          Bekijk Kosten
        </button>

        <span v-if="isCurrentTaskLoading" class="status-text">
          Kosten berekenen...
        </span>
      </div>

      <!-- Advanced Cost Display Component -->
      <AdvancedCostDisplay
        v-if="costBreakdown && parsedRecipe"
        :taskId="taskId"
        :ingredients="parsedRecipe.ingredients || []"
        :baseCost="extractBaseCost(costBreakdown)"
        :servings="1"
        :isLoading="isCurrentTaskLoading"
        @retry="handleGetCostBreakdown"
      />

      <!-- Fallback basic cost breakdown display -->
      <div v-else-if="costBreakdown" class="cost-breakdown">
        <h4>Kostenoverzicht:</h4>
        <div class="cost-content" v-html="formattedCostBreakdown"></div>
      </div>

      <!-- Cost error display -->
      <div v-if="costError" class="error-message">
        <strong>Fout bij kostenoverzicht:</strong> {{ costError.message || costError }}
        <pre v-if="costError.details">{{ costError.details }}</pre>
      </div>
    </div>

    <div class="recipe-actions">
      <button
        @click="$emit('visualize')"
        v-if="!isVisualizing && !imageUrl"
        :disabled="isPolling"
        class="visualize-btn"
      >
        Visualiseer Broodje
      </button>

      <span v-if="isVisualizing" class="status-text">
        Visualisatie starten...
      </span>

      <span v-if="isPolling" class="status-text">
        Bezig met visualiseren (polling)...
      </span>

      <span v-if="isUsingRealtime" class="status-text realtime">
        📡 Bezig met visualiseren (realtime)...
      </span>

      <!-- Image result -->
      <div v-if="imageUrl" class="image-result">
        <h4>Visualisatie:</h4>
        <img :src="imageUrl" :alt="`Visualisatie van ${recipeTitle}`" />
        <button @click="$emit('reset-visualization')" class="reset-btn">
          Nieuwe visualisatie?
        </button>
      </div>
    </div>

    <!-- Polling error display -->
    <div v-if="pollingError" class="error-message">
      <strong>Fout bij visualisatie:</strong> {{ pollingError.message || pollingError }}
      <pre v-if="pollingError.details">{{ pollingError.details }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMarkdown } from '@/composables'
import { useCostBreakdown } from '@/composables/useCostBreakdown'
import AdvancedCostDisplay from './AdvancedCostDisplay.vue'

// Props
interface Props {
  recipe: any
  recipeTitle?: string
  taskId?: string
  isVisualizing?: boolean
  isPolling?: boolean
  isUsingRealtime?: boolean
  imageUrl?: string
  pollingError?: any
}

const props = withDefaults(defineProps<Props>(), {
  recipeTitle: 'Broodje Recept',
  taskId: undefined,
  isVisualizing: false,
  isPolling: false,
  isUsingRealtime: false,
  imageUrl: undefined,
  pollingError: null
})

// Emits
interface Emits {
  (e: 'visualize'): void
  (e: 'reset-visualization'): void
}

defineEmits<Emits>()

// Composables
const { createMarkdownComputed } = useMarkdown()
const { getCostBreakdown, isLoadingCost } = useCostBreakdown()

// State
const costBreakdown = ref<string | null>(null)
const costError = ref<any>(null)

// Computed
const formattedRecipe = createMarkdownComputed(() => {
  return props.recipe?.markdown_recipe_string || ''
})

const formattedCostBreakdown = createMarkdownComputed(() => {
  return costBreakdown.value || ''
})

const isCurrentTaskLoading = computed(() => {
  return props.taskId ? isLoadingCost(props.taskId) : false
})

const parsedRecipe = computed(() => {
  try {
    if (typeof props.recipe === 'string') {
      return JSON.parse(props.recipe)
    }
    return props.recipe
  } catch (error) {
    console.warn('Failed to parse recipe:', error)
    return props.recipe
  }
})

// Methods
const extractBaseCost = (costBreakdownText: string): number => {
  if (!costBreakdownText) return 0

  // Try to extract total cost from markdown-formatted cost breakdown
  const totalMatch = costBreakdownText.match(/\*\*Totale?\s*(?:kostprijs|kosten?)[:]*\s*€?(\d+[.,]\d+)\*\*/i)
  if (totalMatch) {
    return parseFloat(totalMatch[1].replace(',', '.'))
  }

  // Fallback: look for any number with euro sign
  const euroMatch = costBreakdownText.match(/€(\d+[.,]\d+)/)
  if (euroMatch) {
    return parseFloat(euroMatch[1].replace(',', '.'))
  }

  return 0
}

const handleGetCostBreakdown = async () => {
  if (!props.taskId) {
    costError.value = { message: 'Geen taak ID beschikbaar voor kostenoverzicht' }
    return
  }

  costError.value = null

  try {
    const breakdown = await getCostBreakdown(props.taskId)
    if (breakdown) {
      costBreakdown.value = typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown, null, 2)
    } else {
      costError.value = { message: 'Geen kostenoverzicht beschikbaar' }
    }
  } catch (err: any) {
    console.error('Error getting cost breakdown:', err)
    costError.value = err
  }
}
</script>

<style scoped>
.recipe-display {
  margin-top: 24px;
  padding: 24px;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  background-color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.recipe-display h3 {
  margin: 0 0 20px 0;
  color: #28a745;
  font-size: 22px;
  font-weight: 600;
}

.recipe-content {
  margin-bottom: 24px;
}

.recipe-text {
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
  line-height: 1.7;
  font-size: 15px;
}

.recipe-text :deep(h1),
.recipe-text :deep(h2),
.recipe-text :deep(h3),
.recipe-text :deep(h4) {
  color: #333;
  margin-top: 0;
  margin-bottom: 16px;
  font-weight: 600;
}

.recipe-text :deep(h1) {
  font-size: 24px;
  border-bottom: 2px solid #28a745;
  padding-bottom: 8px;
}

.recipe-text :deep(h2) {
  font-size: 20px;
  color: #28a745;
}

.recipe-text :deep(h3) {
  font-size: 18px;
}

.recipe-text :deep(ul),
.recipe-text :deep(ol) {
  margin: 16px 0;
  padding-left: 24px;
}

.recipe-text :deep(li) {
  margin-bottom: 8px;
  line-height: 1.6;
}

.recipe-text :deep(p) {
  margin: 12px 0;
}

.recipe-text :deep(strong) {
  color: #333;
  font-weight: 600;
}

.recipe-placeholder {
  padding: 40px 20px;
  text-align: center;
  color: #6c757d;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px dashed #ced4da;
  font-style: italic;
}

.cost-breakdown-section {
  margin-bottom: 24px;
  padding: 20px;
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 8px;
}

.cost-breakdown-section :deep(.advanced-cost-display) {
  background-color: transparent;
  border: none;
  padding: 0;
  margin-top: 16px;
}

.cost-actions {
  margin-bottom: 16px;
}

.cost-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  background-color: #ffc107;
  color: #212529;
  transition: all 0.2s ease;
}

.cost-btn:hover:not(:disabled) {
  background-color: #e0a800;
  transform: translateY(-1px);
}

.cost-btn:disabled {
  background-color: #6c757d;
  color: white;
  cursor: not-allowed;
  transform: none;
}

.cost-breakdown {
  margin-top: 12px;
}

.cost-breakdown h4 {
  margin: 0 0 12px 0;
  color: #856404;
  font-size: 16px;
  font-weight: 600;
}

.cost-content {
  color: #856404;
  font-size: 14px;
  line-height: 1.5;
}

.cost-content :deep(h2),
.cost-content :deep(h3),
.cost-content :deep(h4) {
  color: #856404;
  margin: 12px 0 8px 0;
}

.cost-content :deep(strong) {
  color: #721c24;
  font-weight: 600;
}

.cost-content :deep(ul),
.cost-content :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.cost-content :deep(img) {
  vertical-align: middle;
  margin-right: 5px;
}

.recipe-actions {
  padding-top: 20px;
  border-top: 2px dashed #e9ecef;
}

.visualize-btn,
.reset-btn {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  margin-right: 12px;
}

.visualize-btn {
  background-color: #007bff;
  color: white;
}

.visualize-btn:hover:not(:disabled) {
  background-color: #0056b3;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
}

.visualize-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.reset-btn {
  background-color: #6c757d;
  color: white;
}

.reset-btn:hover {
  background-color: #5a6268;
  transform: translateY(-1px);
}

.status-text {
  font-style: italic;
  color: #007bff;
  font-weight: 500;
}

.status-text.realtime {
  color: #10b981;
  font-weight: 600;
}

.image-result {
  margin-top: 20px;
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.image-result h4 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.image-result img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.error-message {
  margin-top: 20px;
  padding: 16px;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 8px;
  background-color: #f8d7da;
}

.error-message strong {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.error-message pre {
  margin: 8px 0 0 0;
  font-size: 12px;
  background-color: rgba(0, 0, 0, 0.05);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .recipe-display {
    padding: 16px;
    margin-top: 16px;
  }

  .recipe-display h3 {
    font-size: 20px;
    margin-bottom: 16px;
  }

  .recipe-text {
    padding: 16px;
    font-size: 14px;
  }

  .cost-breakdown-section {
    padding: 16px;
  }

  .visualize-btn,
  .reset-btn,
  .cost-btn {
    width: 100%;
    margin-right: 0;
    margin-bottom: 8px;
  }

  .image-result {
    padding: 16px;
  }

  .image-result h4 {
    font-size: 16px;
  }
}
</style>
