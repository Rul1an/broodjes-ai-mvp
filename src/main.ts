import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

// Eventueel globale CSS hier importeren als je dat wilt
// import './assets/global.css';

// Maak de Vue-applicatie
const app = createApp(App);

// Gebruik Pinia voor state management
const pinia = createPinia();
app.use(pinia);

// Gebruik de router
app.use(router);

// Hier kun je global components of plugins registreren indien nodig
// app.component('GlobalComponent', GlobalComponent);

// Mount de applicatie
app.mount('#app');

// Type declaraties voor globale properties indien nodig
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    // Hier kun je globale properties toevoegen indien nodig
  }
}
