import { ref, type Ref } from 'vue'

export interface CostBreakdownState {
    [taskId: string]: {
        isLoading: boolean
        data: string | null
        error: any
    }
}

export function useCostBreakdown() {
    const costBreakdowns: Ref<CostBreakdownState> = ref({})

    const isLoadingCost = (taskId: string): boolean => {
        return costBreakdowns.value[taskId]?.isLoading || false
    }

    const getCostBreakdown = async (taskId: string): Promise<string | null> => {
        if (!taskId) return null

        // Initialize state if not exists
        if (!costBreakdowns.value[taskId]) {
            costBreakdowns.value[taskId] = {
                isLoading: false,
                data: null,
                error: null
            }
        }

        const state = costBreakdowns.value[taskId]

        // Return cached data if available
        if (state.data && !state.isLoading) {
            return state.data
        }

        // Start loading if not already loading
        if (!state.isLoading) {
            state.isLoading = true
            state.error = null

            try {
                const response = await fetch(`/.netlify/functions/getCostBreakdown?taskId=${taskId}`)
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }

                const data = await response.json()
                state.data = data.cost_breakdown || data.breakdown || JSON.stringify(data, null, 2)
                return state.data
            } catch (error) {
                console.error('Error fetching cost breakdown:', error)
                state.error = error
                throw error
            } finally {
                state.isLoading = false
            }
        }

        return null
    }

    return {
        getCostBreakdown,
        isLoadingCost,
        costBreakdowns
    }
}
