<template>
  <div class="advanced-cost-display">
    <div class="cost-header">
      <h3>🔍 Geavanceerde Kostenanalyse</h3>
      <button @click="toggleExpanded" class="expand-btn">
        {{ isExpanded ? '▼' : '▶' }} {{ isExpanded ? 'Inklappen' : 'Uitklappen' }}
      </button>
    </div>

    <div v-if="isExpanded" class="cost-content">
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Analyseren van nutritionele waarden en seizoensgebonden prijzen...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <p>❌ {{ error }}</p>
        <button @click="retryAnalysis" class="retry-btn">Probeer opnieuw</button>
      </div>

      <!-- Analysis Results -->
      <div v-else-if="analysis" class="analysis-results">
        <!-- Cost Summary -->
        <div class="cost-summary">
          <div class="cost-item">
            <span class="label">Totale kosten:</span>
            <span class="value primary">€{{ analysis.totalCost.toFixed(2) }}</span>
          </div>
          <div class="cost-item">
            <span class="label">Per portie:</span>
            <span class="value">€{{ analysis.costPerServing.toFixed(2) }}</span>
          </div>
        </div>

        <!-- Nutrition Information -->
        <div class="nutrition-section">
          <h4>🥗 Nutritionele Waarden</h4>
          <div class="nutrition-grid">
            <div class="nutrition-item">
              <span class="nutrition-label">Calorieën</span>
              <span class="nutrition-value">{{ analysis.nutrition.calories }} kcal</span>
            </div>
            <div class="nutrition-item">
              <span class="nutrition-label">Eiwitten</span>
              <span class="nutrition-value">{{ analysis.nutrition.protein }}g</span>
            </div>
            <div class="nutrition-item">
              <span class="nutrition-label">Koolhydraten</span>
              <span class="nutrition-value">{{ analysis.nutrition.carbs }}g</span>
            </div>
            <div class="nutrition-item">
              <span class="nutrition-label">Vetten</span>
              <span class="nutrition-value">{{ analysis.nutrition.fat }}g</span>
            </div>
            <div class="nutrition-item">
              <span class="nutrition-label">Vezels</span>
              <span class="nutrition-value">{{ analysis.nutrition.fiber }}g</span>
            </div>
          </div>
        </div>

        <!-- Seasonal Pricing -->
        <div class="seasonal-section">
          <h4>🌱 Seizoensgebonden Prijzen</h4>
          <div class="seasonal-grid">
            <div class="seasonal-item" :class="{ current: currentSeason === 'winter' }">
              <span class="season">❄️ Winter</span>
              <span class="price">€{{ analysis.seasonal.winter.toFixed(2) }}</span>
            </div>
            <div class="seasonal-item" :class="{ current: currentSeason === 'spring' }">
              <span class="season">🌸 Lente</span>
              <span class="price">€{{ analysis.seasonal.spring.toFixed(2) }}</span>
            </div>
            <div class="seasonal-item" :class="{ current: currentSeason === 'summer' }">
              <span class="season">☀️ Zomer</span>
              <span class="price">€{{ analysis.seasonal.summer.toFixed(2) }}</span>
            </div>
            <div class="seasonal-item" :class="{ current: currentSeason === 'autumn' }">
              <span class="season">🍂 Herfst</span>
              <span class="price">€{{ analysis.seasonal.autumn.toFixed(2) }}</span>
            </div>
          </div>
          <p class="seasonal-note">
            Huidige seizoen: <strong>{{ getSeasonName(currentSeason) }}</strong>
          </p>
        </div>

        <!-- Supermarket Comparison -->
        <div class="supermarket-section">
          <h4>🏪 Supermarkt Vergelijking</h4>
          <div class="supermarket-grid">
            <div class="supermarket-item">
              <span class="store">Albert Heijn</span>
              <span class="price">€{{ analysis.supermarketComparison.albert_heijn.toFixed(2) }}</span>
            </div>
            <div class="supermarket-item">
              <span class="store">Jumbo</span>
              <span class="price">€{{ analysis.supermarketComparison.jumbo.toFixed(2) }}</span>
            </div>
            <div class="supermarket-item best-price">
              <span class="store">Lidl</span>
              <span class="price">€{{ analysis.supermarketComparison.lidl.toFixed(2) }}</span>
              <span class="badge">Beste prijs</span>
            </div>
            <div class="supermarket-item">
              <span class="store">Gemiddeld</span>
              <span class="price">€{{ analysis.supermarketComparison.average.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- Scores -->
        <div class="scores-section">
          <div class="score-item">
            <h4>🌍 Duurzaamheidsscore</h4>
            <div class="score-bar">
              <div class="score-fill" :style="{ width: `${analysis.sustainabilityScore * 10}%` }"></div>
              <span class="score-text">{{ analysis.sustainabilityScore }}/10</span>
            </div>
          </div>
          <div class="score-item">
            <h4>💚 Gezondheidsscore</h4>
            <div class="score-bar health">
              <div class="score-fill" :style="{ width: `${analysis.healthScore * 10}%` }"></div>
              <span class="score-text">{{ analysis.healthScore }}/10</span>
            </div>
          </div>
        </div>
      </div>

      <!-- No Analysis State -->
      <div v-else class="no-analysis">
        <p>Klik op "Analyseren" om geavanceerde kostenanalyse te starten</p>
        <button @click="startAnalysis" class="analyze-btn">
          🔍 Analyseren
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAdvancedCostAnalysis } from '../composables/useAdvancedCostAnalysis'

interface Props {
  ingredients: Array<{name: string, quantity: string}>
  baseCost: number
  servings?: number
}

const props = withDefaults(defineProps<Props>(), {
  servings: 1
})

const isExpanded = ref(false)
const { isLoading, error, analysis, currentSeason, analyzeRecipe } = useAdvancedCostAnalysis()

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value && !analysis.value) {
    startAnalysis()
  }
}

async function startAnalysis() {
  try {
    await analyzeRecipe(props.ingredients, props.baseCost, props.servings)
  } catch (err) {
    console.error('Analysis failed:', err)
  }
}

async function retryAnalysis() {
  await startAnalysis()
}

function getSeasonName(season: string): string {
  const seasonNames = {
    winter: 'Winter',
    spring: 'Lente',
    summer: 'Zomer',
    autumn: 'Herfst'
  }
  return seasonNames[season as keyof typeof seasonNames] || season
}
</script>

<style scoped>
.advanced-cost-display {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border: 1px solid #dee2e6;
  border-radius: 12px;
  padding: 1.5rem;
  margin-top: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.cost-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.cost-header h3 {
  margin: 0;
  color: #495057;
  font-size: 1.25rem;
}

.expand-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.expand-btn:hover {
  background: #5a6268;
}

.cost-content {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.loading-state {
  text-align: center;
  padding: 2rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-state {
  text-align: center;
  padding: 1rem;
  color: #dc3545;
}

.retry-btn {
  background: #dc3545;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 0.5rem;
}

.cost-summary {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.cost-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cost-item .label {
  font-size: 0.9rem;
  color: #6c757d;
  margin-bottom: 0.25rem;
}

.cost-item .value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #28a745;
}

.cost-item .value.primary {
  color: #007bff;
  font-size: 1.75rem;
}

.nutrition-section,
.seasonal-section,
.supermarket-section,
.scores-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.nutrition-section h4,
.seasonal-section h4,
.supermarket-section h4,
.scores-section h4 {
  margin: 0 0 1rem 0;
  color: #495057;
  font-size: 1.1rem;
}

.nutrition-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
}

.nutrition-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.nutrition-label {
  font-size: 0.8rem;
  color: #6c757d;
  margin-bottom: 0.25rem;
}

.nutrition-value {
  font-weight: bold;
  color: #495057;
}

.seasonal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.seasonal-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  transition: all 0.2s;
}

.seasonal-item.current {
  background: #e3f2fd;
  border: 2px solid #2196f3;
  transform: scale(1.05);
}

.season {
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.price {
  font-weight: bold;
  color: #495057;
}

.seasonal-note {
  text-align: center;
  font-size: 0.9rem;
  color: #6c757d;
  margin: 0;
}

.supermarket-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.supermarket-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  position: relative;
}

.supermarket-item.best-price {
  background: #d4edda;
  border: 2px solid #28a745;
}

.store {
  font-weight: 500;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #28a745;
  color: white;
  font-size: 0.7rem;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
}

.scores-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.score-item h4 {
  margin-bottom: 0.5rem;
}

.score-bar {
  position: relative;
  height: 24px;
  background: #e9ecef;
  border-radius: 12px;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: linear-gradient(90deg, #28a745, #20c997);
  transition: width 0.5s ease;
}

.score-bar.health .score-fill {
  background: linear-gradient(90deg, #fd7e14, #ffc107);
}

.score-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  color: #495057;
  font-size: 0.9rem;
}

.no-analysis {
  text-align: center;
  padding: 2rem;
}

.analyze-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  margin-top: 1rem;
  transition: background-color 0.2s;
}

.analyze-btn:hover {
  background: #0056b3;
}

@media (max-width: 768px) {
  .cost-summary {
    flex-direction: column;
    gap: 1rem;
  }

  .nutrition-grid,
  .seasonal-grid,
  .supermarket-grid {
    grid-template-columns: 1fr;
  }

  .scores-section {
    grid-template-columns: 1fr;
  }
}
</style>
