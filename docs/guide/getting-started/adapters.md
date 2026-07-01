# Adapters

The core never touches the URL directly. An **adapter** is the seam where your
router plugs in: it tells vuqs how to *read* the current query and how to
*navigate* to a new one. That keeps the core router-agnostic, and keeps URL
concerns like stringifying out of your components.

```ts
interface QueryAdapter {
  query: MaybeRefOrGetter<ParsedQuery> // the current parsed query
  navigate: (query, options) => void | Promise<void> // apply the next query
  defaultOptions?: QueryAdapterDefaultOptions // defaults for every write
}
```

Provide one adapter near the root of your app. Every `useQueryState` and
`useQueryStates` below it reads `query` and `navigate` from there. A composable
with no adapter in scope throws, so this step comes first.

## vue-router

The built-in adapter lives at a subpath, so it is pulled in only when you use it.
Install it on the app, after the router, in `main.ts`:

```ts
// main.ts
import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

const app = createApp(App)

app.use(router)
installQueryAdapter(app, createVueRouterAdapter({ router }))

app.mount('#app')
```

`createVueRouterAdapter` returns the adapter object, and
[`installQueryAdapter`](/api/composables#installqueryadapter) provides it to the
whole app. Pass `router` explicitly: outside a component there is no `setup`, so
the adapter cannot fall back to `useRouter()`.

The adapter reads `router.currentRoute.value.query` and writes with
`router.replace`, switching to `router.push` when the
[`history`](/guide/essentials/navigation-options#history) option is `'push'`.

::: info Using Nuxt?
Nuxt's router is `vue-router`, so this same adapter works. The
[`@vuqs/nuxt`](/nuxt/getting-started) module installs it app-wide for you.
:::

### Defaults for every write

Pass `defaultOptions` to set a baseline for the whole app. For example, default
to `replace` so filter tweaks do not flood the history stack:

```ts
installQueryAdapter(app, createVueRouterAdapter({
  router,
  defaultOptions: { history: 'replace', clearOnDefault: true },
}))
```

These sit at the bottom of the [precedence chain](/guide/essentials/navigation-options#precedence):
a per-call or per-composable option still wins.

::: details Provide from a component instead
`provideVueRouterAdapter` builds and provides the adapter from a component
`setup`, scoping it to that component's subtree instead of the whole app. The
router defaults to `useRouter()`, so no explicit `router` is needed:

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provideVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideVueRouterAdapter()
</script>

<template>
  <RouterView />
</template>
```
:::

::: details Using nested keys like `filters.sort`? Configure qs
`vue-router`'s default query parser is flat, so dotted keys such as `filters.sort`
do not round-trip. To use [nested keys](/guide/going-further/defining-params#nested-keys),
configure the router with [`qs`](https://github.com/ljharb/qs):

```ts
import qs from 'qs'
import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [/* … */],
  parseQuery: qs.parse as never,
  stringifyQuery: qs.stringify as never,
})
```

Flat, top-level keys work without this. Repeated-key arrays (`?tags=a&tags=b`)
and nesting both rely on it.
:::

## Bring your own adapter

An adapter is a plain object, so any source of a query and a way to navigate
works. Build it and provide it yourself:

```ts
import qs from 'qs'
import { provideQueryAdapter } from '@vuqs/core'

provideQueryAdapter({
  query: () => readQuerySomehow(),
  navigate: (query, options) => {
    const search = qs.stringify(query)
    if (options.history === 'push') {
      history.pushState(null, '', `?${search}`)
    }
    else {
      history.replaceState(null, '', `?${search}`)
    }
  },
  defaultOptions: { history: 'replace' },
})
```

`navigate(query, options)` receives the next **parsed** query object and the
resolved [navigation options](/guide/essentials/navigation-options). It owns three
jobs:

1. **Stringify** the query, for example with `qs`.
2. **Navigate**, pushing or replacing per `options.history`.
3. **Honor** `options.scroll` if the router supports it. (vue-router maps scroll
   to `scrollBehavior`, so the per-call option does not apply there.)

It may run synchronously or return a promise.

::: tip
The full adapter contract, including `QueryAdapterDefaultOptions`, lives in the
[API reference](/api/adapters).
:::
