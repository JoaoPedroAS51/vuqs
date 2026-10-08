import { installQueryAdapter } from '@vuqs/core'
import { createBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { createApp } from 'vue'
import { createRouter, createWebHistory, RouterView } from 'vue-router'
import CatalogPage from './CatalogPage.vue'
import NavigationPage from './NavigationPage.vue'
import StoragePage from './StoragePage.vue'

if (window.location.pathname.startsWith('/browser-history/')) {
  const app = createApp(CatalogPage)
  installQueryAdapter(app, createBrowserHistoryAdapter())
  app.mount('#app')
}
else {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/vue-router/catalog', component: CatalogPage },
      { path: '/vue-router/navigation', component: NavigationPage },
      { path: '/vue-router/storage', component: StoragePage },
    ],
  })
  const app = createApp(RouterView)
  app.use(router)
  router.isReady().then(() => {
    installQueryAdapter(app, createVueRouterAdapter({ router }))
    app.mount('#app')
  })
}
