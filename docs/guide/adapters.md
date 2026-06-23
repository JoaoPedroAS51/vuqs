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
`useQueryStates` below it resolves `query` and `navigate` automatically.

## vue-router

The built-in adapter lives at a subpath so it's only pulled in when you use it:

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provideVueRouterAdapter } from 'vuqs/adapters/vue-router'

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

### Create without providing

`createVueRouterAdapter()` returns the adapter object without injecting it —
handy when you want to pass `adapter.query` / `adapter.navigate` explicitly, for
example to the [store](/store/three-states):

```ts
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'

const adapter = createVueRouterAdapter()
// adapter.query, adapter.navigate
```

## Manual adapter

An adapter is just an object. Any source of a query and a way to navigate works.

### Per-call, no provider

You can skip the provider and pass `query` + `navigate` to each composable:

```ts
import qs from 'qs'
import { codecs, useQueryState } from 'vuqs'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const q = useQueryState('q', codecs.string, {
  query: () => route.query,
  navigate: next => router.replace({ query: qs.stringify(next) }),
})
```

### A custom provider

To centralize a non-vue-router setup, build the adapter and provide it yourself:

```ts
import { provideQueryAdapter } from 'vuqs'

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

## How resolution works

When a composable needs `query` / `navigate`, it resolves them in order:

1. Options passed to the composable call.
2. The [provided adapter](/api/composables#providequeryadapter).
3. If neither supplies them, it throws with a clear message.

So you can provide an app-wide adapter *and* override it for a specific component
by passing options.
