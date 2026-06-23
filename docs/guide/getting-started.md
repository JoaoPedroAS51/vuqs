# Getting started

This guide takes you from an empty Vue app to a search box backed by the URL in
about five minutes.

## Install

::: code-group

```bash [pnpm]
pnpm add vuqs
```

```bash [npm]
npm install vuqs
```

```bash [yarn]
yarn add vuqs
```

:::

If you use `vue-router` (most apps do), you already have the only optional peer
dependency the built-in adapter needs.

::: tip
Want runtime defaults and context features too? Add the store alongside the
core: `pnpm add @vuqs/store`. See the [store guide](/store/introduction).
:::

## Provide an adapter

The core is router-agnostic: it never reads or writes the URL directly. A small
**adapter** tells vuqs how to read the current query and how to navigate. Provide
one once, near the root of your app, and every composable below it picks it up.

With `vue-router`, that's one line:

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provideVueRouterAdapter } from 'vuqs/adapters/vue-router'

provideVueRouterAdapter()
</script>

<template>
  <RouterView />
</template>
```

That's all the setup most apps need. Skip ahead to [your first query
state](#your-first-query-state).

::: tip Using Nuxt?
The [`@vuqs/nuxt`](/nuxt/introduction) module provides this adapter app-wide and
auto-imports the composables.
:::

::: details Using nested keys like `filters.sort`? Configure qs.
By default `vue-router` parses the query as a flat map, so dotted keys such as
`filters.sort` won't round-trip. To use [nested keys](/guide/nested-keys), tell
the router to parse and stringify with [`qs`](https://github.com/ljharb/qs):

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

Flat, top-level keys (`q`, `page`, `sort`) work without any of this.
:::

::: details Not using vue-router? Provide a manual adapter.
An adapter is just `{ query, navigate }`. See [Adapters](/guide/adapters#manual-adapter)
for the Nuxt and framework-free recipes.
:::

## Your first query state

[`useQueryState`](/guide/use-query-state) binds **one** query key to a writable
ref. Pass the key and a [codec](/guide/codecs) describing its type:

```vue
<script setup lang="ts">
import { codecs, useQueryState } from 'vuqs'

const q = useQueryState('q', codecs.string.withDefault(''))
//    ^? QueryStateRef<string>
</script>

<template>
  <input v-model="q" placeholder="Search…">
  <p>You searched: {{ q }}</p>
</template>
```

The ref is a normal Vue ref bound to the `q` key, so `v-model`, `computed`, and
`watch` all work as usual — `v-model` writes the ref, which writes the URL.

`.withDefault('')` does two things: it makes the ref non-nullable (reading an
absent key yields `''` instead of `undefined`), and it keeps the default *out* of
the URL — `?q=` never appears when the value equals the default.

## A group of related fields

Most filter UIs have several keys that change together. [`useQueryStates`](/guide/use-query-states)
binds a whole group at once and returns a reactive `values` map plus batch
writers:

```vue
<script setup lang="ts">
import { codecs, defineQueryState, useQueryStates } from 'vuqs'

const { values, setValues, clear } = useQueryStates({
  q: defineQueryState('q', codecs.string.withDefault('')),
  sort: defineQueryState('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryState('page', codecs.integer.withDefault(1)),
})
</script>

<template>
  <input v-model="values.q" placeholder="Search…">

  <select v-model="values.sort">
    <option value="asc">Ascending</option>
    <option value="desc">Descending</option>
  </select>

  <button @click="values.page++">Next page</button>
  <button @click="clear()">Reset filters</button>
</template>
```

Assigning several `values.*` in a row coalesces into **one** navigation, so a
"reset everything" button writes the URL once, not three times.

## Without an adapter

You don't have to provide an adapter — you can pass `query` and `navigate` per
call instead. This is useful in tests or when you want explicit control:

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

The [adapter](/guide/adapters) just saves you from repeating this in every
component.

## Next steps

- **[Core concepts](/guide/concepts)** — the mental model behind codecs, fields, and the commit cycle.
- **[Codecs](/guide/codecs)** — every built-in type and how to build your own.
- **[Navigation options](/guide/navigation-options)** — `push` vs `replace`, throttling, and defaults.
- **[@vuqs/store](/store/introduction)** — when URL state alone isn't enough.
