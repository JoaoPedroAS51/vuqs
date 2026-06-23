# Provide / inject

A store created in one component can be shared with its descendants through Vue's
provide/inject, so a deep filter control reads and writes the same store as the
page that owns it — no prop drilling, no global singleton.

## The three pieces

```ts
import { createQueryStoreKey, provideQueryStore, useQueryStore } from '@vuqs/store'
```

- `createQueryStoreKey()` — a **typed** injection key.
- `provideQueryStore(key, options)` — create a store and provide it.
- `useQueryStore(key)` — read the provided store in a descendant.

## Define a typed key

The key carries the store's schema and context types, so injection stays fully
typed. Define it in a shared module:

```ts
// filters-store.ts
import { createQueryStoreKey } from '@vuqs/store'
import { codecs, defineQueryState } from 'vuqs'

export const schema = {
  q: defineQueryState('q', codecs.string),
  status: defineQueryState('status', codecs.literal(['active', 'archived'] as const)),
}

export const filtersKey = createQueryStoreKey<typeof schema>('filters')
```

`createQueryStoreKey(description?)` takes an optional label shown in Vue devtools.

## Provide at the top

In the component that owns the filters — usually the page — create and provide the
store:

```vue
<!-- ProductsPage.vue -->
<script setup lang="ts">
import { provideQueryStore } from '@vuqs/store'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { filtersKey, schema } from './filters-store'

const adapter = createVueRouterAdapter()

const store = provideQueryStore(filtersKey, {
  schema,
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
})
// `store` is returned too, so the providing component can use it directly.
</script>
```

`provideQueryStore` is `provide(key, createQueryStore(options))` in one call, and
returns the store so the provider can use it as well.

## Inject anywhere below

A descendant — however deep — reads the same store:

```vue
<!-- FilterSidebar.vue -->
<script setup lang="ts">
import { useQueryStore } from '@vuqs/store'
import { filtersKey } from './filters-store'

const store = useQueryStore(filtersKey)

function archive() {
  store.setValue('status', 'archived')
}
</script>

<template>
  <input
    :value="store.selected.q ?? ''"
    @input="store.setValue('q', ($event.target as HTMLInputElement).value || undefined)"
  >
  <button @click="archive">Show archived</button>
</template>
```

Every consumer of `filtersKey` shares one store — one source of truth, one URL.

## Missing provider throws

`useQueryStore` throws if no matching store was provided by an ancestor:

```
[vuqs] useQueryStore must be called under a matching provideQueryStore.
```

This is intentional — a silently-`undefined` store would fail in confusing ways
later. The error points you straight at the missing `provideQueryStore`.

## When to use the core adapter instead

provide/inject here shares a **store** (three states + context). If you only need
to share the URL ⇄ state boundary — not the store's extra layers — the core's
[`provideQueryAdapter`](/guide/adapters) already lets any descendant call
`useQueryState` / `useQueryStates` against the same router. Use the store's
provide/inject when descendants need the *same store instance* (shared `selected`,
`defaults`, and context).
