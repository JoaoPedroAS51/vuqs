# Routing and adapters

The module installs a query adapter on the Vue app through
[`installQueryAdapter`](/api/adapters/install-query-adapter), so every composable
resolves it with no per-component setup.

The module uses the [vue-router adapter](/guide/getting-started/adapters#vue-router)
by default. For apps without a `pages` directory or with `pages: false`, it
automatically uses Nuxt's minimal router. No additional configuration is needed.

Both adapters preserve the current path and hash when writing query state and
support `history: 'push'` and `history: 'replace'`.

Configure navigation defaults through [adapter.defaultOptions](/nuxt/configuration#adapter).

## Bring your own adapter

Set `adapter: false` when replacing the installed adapter with your own implementation:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { adapter: false },
})
```

```ts
// plugins/vuqs.ts
import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

export default defineNuxtPlugin((nuxtApp) => {
  installQueryAdapter(nuxtApp.vueApp, createVueRouterAdapter({ router: useRouter() }))
})
```

## Nested keys

vue-router's default query parser is flat, so dotted keys like `filters.sort` do
not round-trip ([more](/guide/query-state/defining-params#nested-keys)). To use
them in an app using Vue Router, configure the router with `qs` in `app/router.options.ts`. The installed vuqs adapter uses that router; keep `adapter` enabled:

```ts
// app/router.options.ts
import type { RouterConfig } from '@nuxt/schema'
import qs from 'qs'

export default {
  parseQuery: qs.parse as never,
  stringifyQuery: qs.stringify as never,
} satisfies RouterConfig
```

Flat, top-level keys and repeated-key arrays (`?tags=a&tags=b`) work with the
default parser. Nested objects require the custom parser and stringifier.

The minimal router does not use Vue Router configuration. For custom parsing without pages, disable the installed adapter and provide one that supports your format.
