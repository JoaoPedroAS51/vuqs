# Adapter

The module installs the [vue-router adapter](/guide/getting-started/adapters#vue-router)
on the Vue app, so every composable resolves it with no per-component setup. A
plugin provides [`createVueRouterAdapter()`](/api/adapters#createvuerouteradapter)
through [`installQueryAdapter`](/api/composables#installqueryadapter).

## Adapter defaults

`adapter.defaultOptions` sets a baseline for every write, for instance default to
`replace` so filter tweaks do not flood history:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    adapter: { defaultOptions: { history: 'replace', clearOnDefault: true } },
  },
})
```

These sit at the bottom of the
[precedence chain](/guide/essentials/navigation-options#precedence): a per-call or
per-composable option still wins. They are also exposed through
`runtimeConfig.public.vuqs.adapter`, so they can be overridden per environment like
any public runtime config.

## Bring your own adapter

Set `adapter: false` to take over provisioning, for a non-router query source or to
wire `qs` for [nested keys](#nested-keys):

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { adapter: false },
})
```

```ts
// plugins/vuqs.ts
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

export default defineNuxtPlugin((nuxtApp) => {
  installQueryAdapter(nuxtApp.vueApp, createVueRouterAdapter({ router: useRouter() }))
})
```

`installQueryAdapter` is the app-level counterpart to `provideQueryAdapter`: it
provides the adapter on the Vue app rather than a component instance, which is why a
plugin can register it.

## Nested keys

vue-router's default query parser is flat, so dotted keys like `filters.sort` do
not round-trip ([more](/guide/going-further/defining-params#nested-keys)). To use
them, configure the router with `qs` in `app/router.options.ts`:

```ts
// app/router.options.ts
import type { RouterConfig } from '@nuxt/schema'
import qs from 'qs'

export default {
  parseQuery: qs.parse as never,
  stringifyQuery: qs.stringify as never,
} satisfies RouterConfig
```

Flat, top-level keys work without this. Repeated-key arrays (`?tags=a&tags=b`) and
nesting both rely on it.
