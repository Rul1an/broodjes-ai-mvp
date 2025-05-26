import type { Ref } from 'vue'
import { computed, ref } from 'vue'

export interface NutritionInfo {
    calories: number
    protein: number // grams
    carbs: number // grams
    fat: number // grams
    fiber: number // grams
}

export interface SeasonalPricing {
    winter: number // price adjustment factor
    spring: number
    summer: number
    autumn: number
}

export interface AdvancedCostBreakdown {
    totalCost: number
    costPerServing: number
    nutrition: NutritionInfo
    seasonal: SeasonalPricing
    supermarketComparison: {
        albert_heijn: number
        jumbo: number
        lidl: number
        average: number
    }
    sustainabilityScore: number // 1-10 scale
    healthScore: number // 1-10 scale
}

export interface IngredientNutrition {
    [key: string]: {
        caloriesPer100g: number
        proteinPer100g: number
        carbsPer100g: number
        fatPer100g: number
        fiberPer100g: number
        seasonalFactors: SeasonalPricing
        sustainabilityScore: number
    }
}

// Nutritional database for common sandwich ingredients
const INGREDIENT_NUTRITION: IngredientNutrition = {
    'broodje': {
        caloriesPer100g: 265,
        proteinPer100g: 9,
        carbsPer100g: 49,
        fatPer100g: 3.2,
        fiberPer100g: 2.7,
        seasonalFactors: { winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0 },
        sustainabilityScore: 6
    },
    'kaas': {
        caloriesPer100g: 356,
        proteinPer100g: 25,
        carbsPer100g: 1.3,
        fatPer100g: 27,
        fiberPer100g: 0,
        seasonalFactors: { winter: 1.05, spring: 1.0, summer: 1.02, autumn: 1.0 },
        sustainabilityScore: 4
    },
    'ham': {
        caloriesPer100g: 145,
        proteinPer100g: 21,
        carbsPer100g: 1.5,
        fatPer100g: 5.5,
        fiberPer100g: 0,
        seasonalFactors: { winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0 },
        sustainabilityScore: 3
    },
    'sla': {
        caloriesPer100g: 15,
        proteinPer100g: 1.4,
        carbsPer100g: 2.9,
        fatPer100g: 0.2,
        fiberPer100g: 1.3,
        seasonalFactors: { winter: 1.3, spring: 0.9, summer: 0.8, autumn: 1.1 },
        sustainabilityScore: 8
    },
    'tomaat': {
        caloriesPer100g: 18,
        proteinPer100g: 0.9,
        carbsPer100g: 3.9,
        fatPer100g: 0.2,
        fiberPer100g: 1.2,
        seasonalFactors: { winter: 1.4, spring: 1.1, summer: 0.7, autumn: 0.9 },
        sustainabilityScore: 7
    },
    'mayonaise': {
        caloriesPer100g: 680,
        proteinPer100g: 1.5,
        carbsPer100g: 0.6,
        fatPer100g: 75,
        fiberPer100g: 0,
        seasonalFactors: { winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0 },
        sustainabilityScore: 5
    },
    'mosterd': {
        caloriesPer100g: 66,
        proteinPer100g: 4.4,
        carbsPer100g: 5.8,
        fatPer100g: 3.3,
        fiberPer100g: 3.3,
        seasonalFactors: { winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0 },
        sustainabilityScore: 6
    },
    'rucola': {
        caloriesPer100g: 25,
        proteinPer100g: 2.6,
        carbsPer100g: 3.7,
        fatPer100g: 0.7,
        fiberPer100g: 1.6,
        seasonalFactors: { winter: 1.2, spring: 0.9, summer: 1.0, autumn: 1.1 },
        sustainabilityScore: 8
    }
}

export function useAdvancedCostAnalysis() {
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const analysis = ref<AdvancedCostBreakdown | null>(null)

    const currentSeason = computed(() => {
        const month = new Date().getMonth()
        if (month >= 2 && month <= 4) return 'spring'
        if (month >= 5 && month <= 7) return 'summer'
        if (month >= 8 && month <= 10) return 'autumn'
        return 'winter'
    })

    function parseIngredientWeight(quantity: string, name: string): number {
        // Convert various units to grams for nutritional calculation
        const lowerQuantity = quantity.toLowerCase()
        const lowerName = name.toLowerCase()

        // Extract number from quantity string
        const numberMatch = quantity.match(/(\d+(?:\.\d+)?)/);
        const amount = numberMatch ? parseFloat(numberMatch[1]) : 1;

        // Convert to grams based on unit and ingredient type
        if (lowerQuantity.includes('g')) {
            return amount
        }
        if (lowerQuantity.includes('kg')) {
            return amount * 1000
        }
        if (lowerQuantity.includes('plak')) {
            if (lowerName.includes('kaas')) return amount * 20
            if (lowerName.includes('ham')) return amount * 15
            return amount * 18 // default slice weight
        }
        if (lowerQuantity.includes('stuk')) {
            if (lowerName.includes('broodje') || lowerName.includes('brood')) return amount * 50
            if (lowerName.includes('tomaat')) return amount * 120
            return amount * 50 // default piece weight
        }
        if (lowerQuantity.includes('eetlepel') || lowerQuantity.includes('el')) {
            return amount * 15 // 15g per tablespoon
        }
        if (lowerQuantity.includes('theelepel') || lowerQuantity.includes('tl')) {
            return amount * 5 // 5g per teaspoon
        }
        if (lowerQuantity.includes('handvol')) {
            if (lowerName.includes('sla') || lowerName.includes('rucola')) return amount * 30
            return amount * 25 // default handful weight
        }

        return 50 // fallback weight in grams
    }

    function calculateNutrition(ingredients: Array<{ name: string, quantity: string }>): NutritionInfo {
        let totalCalories = 0
        let totalProtein = 0
        let totalCarbs = 0
        let totalFat = 0
        let totalFiber = 0

        for (const ingredient of ingredients) {
            const name = ingredient.name.toLowerCase()
            const weight = parseIngredientWeight(ingredient.quantity, name)

            // Find matching nutrition data (fuzzy matching)
            let nutritionData = null
            for (const [key, data] of Object.entries(INGREDIENT_NUTRITION)) {
                if (name.includes(key) || key.includes(name.split(' ')[0])) {
                    nutritionData = data
                    break
                }
            }

            if (nutritionData) {
                const factor = weight / 100 // convert to per 100g basis
                totalCalories += nutritionData.caloriesPer100g * factor
                totalProtein += nutritionData.proteinPer100g * factor
                totalCarbs += nutritionData.carbsPer100g * factor
                totalFat += nutritionData.fatPer100g * factor
                totalFiber += nutritionData.fiberPer100g * factor
            }
        }

        return {
            calories: Math.round(totalCalories),
            protein: Math.round(totalProtein * 10) / 10,
            carbs: Math.round(totalCarbs * 10) / 10,
            fat: Math.round(totalFat * 10) / 10,
            fiber: Math.round(totalFiber * 10) / 10
        }
    }

    function calculateSeasonalPricing(ingredients: Array<{ name: string, quantity: string }>, baseCost: number): SeasonalPricing {
        let winterFactor = 0
        let springFactor = 0
        let summerFactor = 0
        let autumnFactor = 0
        let totalWeight = 0

        for (const ingredient of ingredients) {
            const name = ingredient.name.toLowerCase()
            const weight = parseIngredientWeight(ingredient.quantity, name)

            // Find matching seasonal data
            for (const [key, data] of Object.entries(INGREDIENT_NUTRITION)) {
                if (name.includes(key) || key.includes(name.split(' ')[0])) {
                    winterFactor += data.seasonalFactors.winter * weight
                    springFactor += data.seasonalFactors.spring * weight
                    summerFactor += data.seasonalFactors.summer * weight
                    autumnFactor += data.seasonalFactors.autumn * weight
                    totalWeight += weight
                    break
                }
            }
        }

        if (totalWeight === 0) {
            return { winter: baseCost, spring: baseCost, summer: baseCost, autumn: baseCost }
        }

        return {
            winter: Math.round((baseCost * winterFactor / totalWeight) * 100) / 100,
            spring: Math.round((baseCost * springFactor / totalWeight) * 100) / 100,
            summer: Math.round((baseCost * summerFactor / totalWeight) * 100) / 100,
            autumn: Math.round((baseCost * autumnFactor / totalWeight) * 100) / 100
        }
    }

    function calculateSustainabilityScore(ingredients: Array<{ name: string, quantity: string }>): number {
        let totalScore = 0
        let totalWeight = 0

        for (const ingredient of ingredients) {
            const name = ingredient.name.toLowerCase()
            const weight = parseIngredientWeight(ingredient.quantity, name)

            for (const [key, data] of Object.entries(INGREDIENT_NUTRITION)) {
                if (name.includes(key) || key.includes(name.split(' ')[0])) {
                    totalScore += data.sustainabilityScore * weight
                    totalWeight += weight
                    break
                }
            }
        }

        return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : 5
    }

    function calculateHealthScore(nutrition: NutritionInfo): number {
        // Simple health score based on nutritional balance
        let score = 5 // base score

        // Protein bonus (good for satiety)
        if (nutrition.protein > 15) score += 1
        if (nutrition.protein > 25) score += 1

        // Fiber bonus (good for digestion)
        if (nutrition.fiber > 3) score += 1
        if (nutrition.fiber > 6) score += 1

        // Fat penalty if too high
        if (nutrition.fat > 30) score -= 1
        if (nutrition.fat > 50) score -= 2

        // Calorie consideration
        if (nutrition.calories < 400) score += 0.5
        if (nutrition.calories > 800) score -= 1

        return Math.max(1, Math.min(10, Math.round(score * 10) / 10))
    }

    async function analyzeRecipe(
        ingredients: Array<{ name: string, quantity: string }>,
        baseCost: number,
        servings: number = 1
    ): Promise<AdvancedCostBreakdown> {
        isLoading.value = true
        error.value = null

        try {
            const nutrition = calculateNutrition(ingredients)
            const seasonal = calculateSeasonalPricing(ingredients, baseCost)
            const sustainabilityScore = calculateSustainabilityScore(ingredients)
            const healthScore = calculateHealthScore(nutrition)

            // Simulate supermarket price comparison (in real app, this could be API calls)
            const supermarketComparison = {
                albert_heijn: Math.round((baseCost * 1.15) * 100) / 100, // AH typically 15% higher
                jumbo: Math.round((baseCost * 1.05) * 100) / 100, // Jumbo typically 5% higher
                lidl: Math.round((baseCost * 0.85) * 100) / 100, // Lidl typically 15% lower
                average: Math.round((baseCost * 1.02) * 100) / 100 // Average 2% higher
            }

            const result: AdvancedCostBreakdown = {
                totalCost: baseCost,
                costPerServing: Math.round((baseCost / servings) * 100) / 100,
                nutrition,
                seasonal,
                supermarketComparison,
                sustainabilityScore,
                healthScore
            }

            analysis.value = result
            return result

        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Er is een fout opgetreden bij de analyse'
            throw err
        } finally {
            isLoading.value = false
        }
    }

    return {
        isLoading: isLoading as Ref<boolean>,
        error: error as Ref<string | null>,
        analysis: analysis as Ref<AdvancedCostBreakdown | null>,
        currentSeason,
        analyzeRecipe
    }
}
