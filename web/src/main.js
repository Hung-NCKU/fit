import {installFixedAppViewport} from './app-viewport.js';
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';

import ChatView from './views/ChatView.vue';
import TodayView from './views/TodayView.vue';
import WorkoutsView from './views/WorkoutsView.vue';
import MealsView from './views/MealsView.vue';
import PetView from './views/PetView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 開啟 App 的第一眼是寵物，教練改掛在 /chat
    { path: '/', component: PetView },
    { path: '/chat', component: ChatView },
    { path: '/today', component: TodayView },
    { path: '/workouts', component: WorkoutsView },
    { path: '/meals', component: MealsView },
    // 舊的書籤或已安裝 PWA 可能還指著 /pet
    { path: '/pet', redirect: '/' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

installFixedAppViewport();
createApp(App).use(router).mount('#app');

// Service worker 只在打包後的正式版註冊，開發模式會干擾 Vite 的熱更新
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
