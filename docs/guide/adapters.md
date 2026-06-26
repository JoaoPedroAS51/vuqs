# Adapters

The vuqs core never touches the URL directly. An **adapter** is the seam where
your router plugs in: it tells vuqs how to *read* the current query and how to
*navigate* to a new one. This keeps the core router-agnostic — and keeps URL
concerns like stringifying with `qs` out of your components.

```ts
interface QueryAdapter {
  query: MaybeRefOrGetter<ParsedQuery> // the current parsed query
  navigate: (query, options) => void | Promise<void> // apply the next query
  defaultOptions?: QueryAdapterDefaultOptions // defaults for every write
}
```

Provide an adapter once near the root, and every `useQueryState` /
`useQueryStates` below it reads `query` and `navigate` from it — there's no other
source, so a composable with no adapter in scope throws.

## vue-router

The built-in adapter lives at a subpath so it's only pulled in when you use it:

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provideVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideVueRouterAdapter()
</script>
```

It reads `router.currentRoute.value.query` and writes with `router.replace` (or
`router.push` when [`history: 'push'`](/guide/navigation-options#history)). The
router defaults to `useRouter()`, so call it inside `setup`.

### Defaults for every write

Pass `defaultOptions` to set a baseline for the whole app — for instance, default
to `replace` so filter tweaks don't flood history:

```ts
provideVueRouterAdapter({
  defaultOptions: { history: 'replace', clearOnDefault: true },
})
```

These sit at the bottom of the [precedence chain](/guide/navigation-options#precedence):
a per-call or per-composable option still wins.

### Works for Nuxt too

Nuxt's router **is** `vue-router`. The same adapter covers a Nuxt app — call
`provideVueRouterAdapter()` from a layout or a top-level component (or a plugin),
and `useRouter()` resolves Nuxt's router.

The [`@vuqs/nuxt`](/nuxt/introduction) module auto-imports the composables and
provides this adapter app-wide.

### Nested keys need qs

`vue-router`'s default query parser is flat, so dotted keys like `filters.sort`
won't round-trip. To use [nested keys](/guide/nested-keys), configure the router
with `qs`:

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

Flat, top-level keys work without this. Arrays (`?tags=a&tags=b`) and nesting
both rely on it.

### Create and provide separately

`provideVueRouterAdapter()` builds the adapter and provides it in one step. To
split those — say, to register it at the app level in `main.ts` rather than from a
component — `createVueRouterAdapter()` returns the bare object, which you hand to
[`installQueryAdapter`](/api/composables#installqueryadapter) (app-level) or
[`provideQueryAdapter`](/api/composables#providequeryadapter) (component-level):

```ts
import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

installQueryAdapter(app, createVueRouterAdapter())
```

## Manual adapter

An adapter is just an object. Any source of a query and a way to navigate works.

### A custom provider

To centralize a non-vue-router setup, build the adapter and provide it yourself:

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

### The navigate contract

`navigate(query, options)` receives the next **parsed** query object and the
resolved [navigation options](/guide/navigation-options). It's responsible for:

1. **Stringifying** the query (e.g. with `qs`).
2. **Navigating** — push or replace per `options.history`.
3. Honoring `options.scroll` if your router supports it (vue-router maps scroll to
   `scrollBehavior`, so the per-call option is ignored there).

It may run synchronously or return a promise.

## Where `query` and `navigate` come from

A composable takes `query` and `navigate` solely from the
[provided adapter](/api/composables#providequeryadapter) — there's no per-call
override, and no adapter in scope throws with a clear message. Behavior options
(`history`, `scroll`, `throttleMs`, `clearOnDefault`) are the other half: pass them
per call, and they fall back to the adapter's `defaultOptions`.
