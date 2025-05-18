import { createApp } from 'vue';
import App from './App.vue';

// Eventueel globale CSS hier importeren als je dat wilt
// import './assets/global.css';

const app = createApp(App);

// Hier kun je global components of plugins registreren indien nodig
// app.component('GlobalComponent', GlobalComponent);
// app.use(MyPlugin);

app.mount('#app');
