import { createApp } from 'vue';
import App from './App.vue';
import router from './router'; // Importeer de router

// Eventueel globale CSS hier importeren als je dat wilt
// import './assets/global.css';

const app = createApp(App);

app.use(router); // Vertel de app om de router te gebruiken

// Hier kun je global components of plugins registreren indien nodig
// app.component('GlobalComponent', GlobalComponent);
// app.use(MyPlugin);

app.mount('#app');
