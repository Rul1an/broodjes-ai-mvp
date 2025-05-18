import { defineStore } from 'pinia';

// Definieer het type voor de applicatiestatus
type AppStatus = 'idle' | 'loading' | 'success' | 'error';

// Definieer de interface voor de store state
interface AppState {
  status: AppStatus;
  error: string | null;
  isSidebarOpen: boolean;
}

export const useAppStore = defineStore('app', {
  // State
  state: (): AppState => ({
    status: 'idle',       // idle, loading, success, error
    error: null,         // Foutbericht indien van toepassing
    isSidebarOpen: false // Voor eventuele zijbalk functionaliteit
  }),

  // Getters
  getters: {
    isLoading: (state) => state.status === 'loading',
    hasError: (state) => state.status === 'error' && state.error !== null,
    getError: (state) => state.error
  },

  // Actions
  actions: {
    setLoading() {
      this.status = 'loading';
      this.error = null;
    },
    
    setSuccess() {
      this.status = 'success';
      this.error = null;
    },
    
    setError(error: string) {
      this.status = 'error';
      this.error = error;
      // Reset de error na 5 seconden
      setTimeout(() => {
        this.error = null;
      }, 5000);
    },
    
    resetStatus() {
      this.status = 'idle';
      this.error = null;
    },
    
    toggleSidebar() {
      this.isSidebarOpen = !this.isSidebarOpen;
    },
    
    setSidebarOpen(isOpen: boolean) {
      this.isSidebarOpen = isOpen;
    }
  }
});

// Exporteer de store types voor gebruik in componenten
export type { AppStatus };
