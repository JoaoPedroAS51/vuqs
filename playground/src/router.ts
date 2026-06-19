import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  { path: '/single', name: 'single', component: () => import('./pages/SingleStatePage.vue') },
  { path: '/grouped', name: 'grouped', component: () => import('./pages/GroupedStatesPage.vue') },
  { path: '/store', name: 'store', component: () => import('./pages/StoreDefaultsPage.vue') },
  { path: '/context', name: 'context', component: () => import('./pages/StoreContextPage.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
