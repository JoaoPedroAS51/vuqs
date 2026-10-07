# Adapters

The core never touches the URL directly. An **adapter** is the boundary with your
router: it tells vuqs how to *read* the current query and how to
*navigate* to a new one. That keeps the core router-agnostic, and keeps URL
concerns like stringifying out of your components.

```ts
interface QueryAdapter {
  debugName?: string // optional diagnostic identity
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
[`installQueryAdapter`](/api/adapters/install-query-adapter) provides it to the
whole app. Pass `router` explicitly: outside a component there is no `setup`, so
the adapter cannot fall back to `useRouter()`.

The adapter reads `router.currentRoute.value.query` and writes with
`router.replace`, switching to `router.push` when the
[`history`](/guide/query-state/navigation-options#history) option is `'push'`.

::: info Using Nuxt?
[`@vuqs/nuxt`](/nuxt/getting-started) installs this adapter app-wide.
:::

### Defaults for every write

Pass `defaultOptions` to set a baseline for the whole app. For example, use
`replace` to avoid adding a history entry for each filter edit:

```ts
installQueryAdapter(app, createVueRouterAdapter({
  router,
  defaultOptions: { history: 'replace', clearOnDefault: true },
}))
```

These sit at the bottom of the [precedence chain](/guide/query-state/navigation-options#precedence):
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
do not round-trip. To use [nested keys](/guide/query-state/defining-params#nested-keys),
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

Flat, top-level keys and repeated-key arrays (`?tags=a&tags=b`) work with the
default parser. Nested objects require the custom parser and stringifier.
:::

## Browser History API

Use the browser adapter in a Vue app without a router. Create it in the browser
and install it on the app:

```ts
import { installQueryAdapter } from '@vuqs/core'
import { createBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
const adapter = createBrowserHistoryAdapter({
  defaultOptions: { history: 'replace' },
})

installQueryAdapter(app, adapter)
app.onUnmount(adapter.dispose)
app.mount('#app')
```

The adapter reads `window.location.search` and writes with `history.replaceState`,
or `history.pushState` when `history` is `'push'`. Writes preserve the pathname,
hash, and existing `history.state`. Scroll stays in place unless `scroll` is `true`,
which scrolls to the top.

Objects use dotted keys (`filters.sort=name`). Arrays of scalar values use repeated
keys (`tag=a&tag=b`). Numbers and booleans read back as strings, which codecs decode.
Nullish values and empty arrays or objects are omitted. Arrays containing objects
or other arrays are unsupported and throw before navigation.

The reactive query updates after each adapter write and on `popstate` for back and
forward navigation. External `pushState` and `replaceState` calls need a refresh:

```ts
window.history.replaceState(window.history.state, '', '?q=external')
adapter.refresh()
```

Call `dispose()` when the adapter is no longer needed. It removes the listener and
cancels pending writes. Later `navigate()` and `refresh()` calls throw.

To provide from a component, call `provideBrowserHistoryAdapter()` in `setup`.
It disposes the adapter when the component's scope stops:

```vue
<script setup lang="ts">
import { provideBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'

provideBrowserHistoryAdapter()
</script>
```

::: warning Browser only
Importing this subpath on the server is safe. Creating either adapter requires
`window` and throws on the server. Use an adapter with a server query source for SSR.
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
resolved [navigation options](/guide/query-state/navigation-options). It owns three
jobs:

1. **Stringify** the query, for example with `qs`.
2. **Navigate**, pushing or replacing per `options.history`.
3. **Honor** `options.scroll` if the router supports it. (vue-router maps scroll
   to `scrollBehavior`, so the per-call option does not apply there.)

It completes synchronously or returns a promise for asynchronous navigation.

::: tip
The full adapter contract, including `QueryAdapterDefaultOptions`, lives in the
[API reference](/api/adapters/query-adapter).
:::

## Navigation completion

For synchronous navigation, `navigate` returns `void` after applying the update.
For asynchronous navigation, it returns a promise that resolves after `query`
exposes the final committed state, including normalization or redirects. A
successful navigation to the current URL also completes the attempt.
Throw or reject on failure or cancellation.

The queue releases only the versions belonging to a completed attempt. It does
not compare serialized values with the adapter's parsed representation to prove
that navigation committed. Writes made during that attempt remain queued for the
next navigation.

When calling `adapter.navigate` directly, await the operation and handle errors; the
queue handles failures for composable writes.
