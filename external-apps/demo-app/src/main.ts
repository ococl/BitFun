import { createApp } from 'vue';
import App from './App.vue';

// Register Service Worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // eslint-disable-next-line no-console
        console.log('[PWA] ServiceWorker registered:', reg.scope);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[PWA] ServiceWorker registration failed:', err);
      });
  });
}

createApp(App).mount('#app');
