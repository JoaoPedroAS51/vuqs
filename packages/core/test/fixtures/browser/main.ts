import type { RouteRecordRaw, RouterScrollBehavior } from 'vue-router'
import { installQueryAdapter } from '@vuqs/core'
import { createBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { createApp } from 'vue'
import { createRouter, createWebHistory, RouterView } from 'vue-router'
import CatalogPage from './CatalogPage.vue'
import NavigationPage from './NavigationPage.vue'
import RouterScrollPage from './RouterScrollPage.vue'
import ScrollPage from './ScrollPage.vue'
import StoragePage from './StoragePage.vue'

declare module 'vue-router' {
  interface RouteMeta {
    scrollBehavior?: RouterScrollBehavior
  }
}

if (window.location.pathname.startsWith('/browser-history/')) {
  const app = createApp(window.location.pathname === '/browser-history/scroll' ? ScrollPage : CatalogPage)
  installQueryAdapter(app, createBrowserHistoryAdapter())
  app.mount('#app')
}
else if (window.location.pathname.startsWith('/vue-router-bare/')) {
  mountRouterApp([{ path: '/vue-router-bare/scroll', component: RouterScrollPage }])
}
else {
  mountRouterApp(
    [
      { path: '/vue-router/catalog', component: CatalogPage },
      { path: '/vue-router/navigation', component: NavigationPage },
      { path: '/vue-router/storage', component: StoragePage },
      { path: '/vue-router/scroll', component: ScrollPage },
      {
        path: '/vue-router/scroll/top',
        component: RouterScrollPage,
        meta: { scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 } },
      },
      { path: '/vue-router/scroll/keep', component: RouterScrollPage, meta: { scrollBehavior: () => false } },
    ],
    (to, from, savedPosition) => to.meta.scrollBehavior?.(to, from, savedPosition),
  )
}

function mountRouterApp(routes: RouteRecordRaw[], scrollBehavior?: RouterScrollBehavior): void {
  const router = createRouter({ history: createWebHistory(), routes, scrollBehavior })
  const app = createApp(RouterView)
  app.use(router)
  router.isReady().then(() => {
    installQueryAdapter(app, createVueRouterAdapter({ router }))
    app.mount('#app')
  })
}
