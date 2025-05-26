<template>
  <div v-if="hasError" class="error-boundary">
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <h3>Er is iets misgegaan</h3>
      <p class="error-message">{{ errorMessage }}</p>
      <div class="error-actions">
        <button @click="resetError" class="btn-primary">
          Probeer opnieuw
        </button>
        <button @click="reloadPage" class="btn-secondary">
          Pagina herladen
        </button>
      </div>
      <details v-if="showDetails" class="error-details">
        <summary>Technische details</summary>
        <pre>{{ errorDetails }}</pre>
      </details>
      <button @click="showDetails = !showDetails" class="btn-link">
        {{ showDetails ? 'Verberg' : 'Toon' }} technische details
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const hasError = ref(false)
const errorMessage = ref('')
const errorDetails = ref('')
const showDetails = ref(false)

onErrorCaptured((error: Error) => {
  console.error('ErrorBoundary caught error:', error)

  hasError.value = true
  errorMessage.value = getErrorMessage(error)
  errorDetails.value = `${error.name}: ${error.message}\n\nStack trace:\n${error.stack}`

  return false // Prevent error from propagating
})

function getErrorMessage(error: Error): string {
  // Provide user-friendly error messages based on error type
  if (error.message.includes('Network')) {
    return 'Er is een netwerkfout opgetreden. Controleer je internetverbinding.'
  }
  if (error.message.includes('fetch')) {
    return 'Er kan geen verbinding worden gemaakt met de server.'
  }
  if (error.message.includes('parse') || error.message.includes('JSON')) {
    return 'Er is een probleem met de ontvangen data.'
  }
  if (error.message.includes('timeout')) {
    return 'De aanvraag duurde te lang. Probeer het opnieuw.'
  }

  return 'Er is een onverwachte fout opgetreden.'
}

function resetError() {
  hasError.value = false
  errorMessage.value = ''
  errorDetails.value = ''
  showDetails.value = false
}

function reloadPage() {
  window.location.reload()
}
</script>

<style scoped>
.error-boundary {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin: 1rem 0;
}

.error-container {
  text-align: center;
  max-width: 500px;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.error-container h3 {
  color: #dc2626;
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
}

.error-message {
  color: #7f1d1d;
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 1rem;
}

.btn-primary {
  background-color: #dc2626;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #b91c1c;
}

.btn-secondary {
  background-color: #6b7280;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-secondary:hover {
  background-color: #4b5563;
}

.btn-link {
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.btn-link:hover {
  color: #1d4ed8;
}

.error-details {
  margin-top: 1rem;
  text-align: left;
}

.error-details summary {
  cursor: pointer;
  color: #6b7280;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.error-details pre {
  background-color: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 1rem;
  font-size: 0.8rem;
  color: #4b5563;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}
</style>
