# useQueryStates

Binds a **group** of query keys at once. Use it for a filter bar, a search +
sort + page trio, anything where several keys change together and you want
multi-param writes to land as a single navigation.

```ts
import { codecs, defineQueryParam, useQueryStates } from '@vuqs/core'

const { values, setValues, clear } = useQueryStates({
  q: defineQueryParam('q', codecs.string.withDefault('')),
  sort: defineQueryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryParam('page', codecs.integer.withDefault(1)),
})
```

The argument is a [schema](/guide/concepts#schema-a-map-of-params): a map of
logical names to [params](/guide/defining-params).

## What you get back

```ts
interface UseQueryStatesApi {
  values: { q: string; sort: 'asc' | 'desc'; page: number }  // reactive, writable
  setValues: (values: QueryStateWriteValues<typeof schema>, options?: NavigateOptions) => void // batch write
  clear: (options?: NavigateOptions) => void                   // reset all
}
```

### `values` — a reactive value map

`values.q` *is* the value, not a ref. Read it, assign it, `v-model` it:

```vue
<template>
  <input v-model="values.q">
  <select v-model="values.sort"> … </select>
  <button @click="values.page++">Next</button>
</template>
```

Params declaring a `.withDefault()` are **non-nullable** in `values`, so reads
need no `?? fallback`:

```ts
values.q.trim()   // string — no guard needed
values.page + 1   // number
```

A param without a default reads as `T | undefined`.

::: warning Replace, don't mutate
`values` tracks assignment, not in-place mutation. To change an array param,
assign a new array:

```ts
values.tags = [...values.tags, 'new'] // ✅ navigates
values.tags.push('new')               // ❌ no navigation
```
:::

### Per-field refs with `toQueryRefs`

The grouped `values` map drops the per-field `.set`/`.clear` a single
[`useQueryState`](/guide/use-query-state) ref carries. To get them back — or to pass
one field around as a ref — explode `values` with
[`toQueryRefs`](/api/composables#toqueryrefs):

```ts
import { toQueryRefs } from '@vuqs/core'

const { q, page } = toQueryRefs(values)

q.value = 'laptop'                 // write, like values.q = 'laptop'
page.set(2, { history: 'push' })   // per-call options, back on a field
q.clear()                          // remove ?q
```

Each ref routes back through `values`, so it inherits the same clearing rule —
including the effective default under [`withRuntimeDefaults`](/modules/runtime-defaults).
Reaching for one param from the start? Use `useQueryState` instead.

### `setValues` — batch write

Sets several params in one coalesced navigation. Each param follows the
three-state [write protocol](/guide/null-vs-undefined):

- **omit / `undefined`** → leave the param untouched
- **`null`** → clear the param (revert to default)
- **a value** → set it

```ts
setValues({ q: 'laptop', page: 1 })          // set q and page, leave sort alone
setValues({ sort: null })                     // clear sort
setValues({ q: 'phone' }, { history: 'push' }) // with per-call options
```

This is why `setValues` takes `null` to clear: it needs a way to say "clear this
one" that's distinct from "don't touch this one." (Single refs clear via
`.clear()` / `= undefined` instead — see [null vs undefined](/guide/null-vs-undefined).)

### `clear` — reset everything

```ts
clear()                      // every param back to its default, one navigation
clear({ history: 'push' })   // with options
```

## Coalescing: many writes, one navigation

Assigning several `values.*` in a row — or calling `setValues` with multiple keys
— produces exactly **one** history entry, because writes within a tick coalesce:

```ts
function resetFilters() {
  values.q = ''
  values.sort = 'asc'
  values.page = 1
} // → a single navigation, not three
```

This is the main reason to prefer `useQueryStates` over several `useQueryState`
calls for a related group.

## Full example

```vue
<script setup lang="ts">
import { codecs, defineQueryParam, useQueryStates } from '@vuqs/core'
import { computed } from 'vue'

const { values, setValues, clear } = useQueryStates({
  q: defineQueryParam('q', codecs.string.withDefault('')),
  sort: defineQueryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryParam('page', codecs.integer.withDefault(1)),
})

const results = computed(() => runSearch(values.q, values.sort, values.page))

function search(term: string) {
  // New search resets to page 1 — one navigation.
  setValues({ q: term, page: 1 })
}
</script>

<template>
  <input :value="values.q" @input="search(($event.target as HTMLInputElement).value)">
  <select v-model="values.sort">
    <option value="asc">Price ↑</option>
    <option value="desc">Price ↓</option>
  </select>

  <ul>
    <li v-for="r in results" :key="r.id">{{ r.name }}</li>
  </ul>

  <button @click="values.page++">Next page</button>
  <button @click="clear()">Reset</button>
</template>
```

## `useQueryState` vs `useQueryStates`

| | `useQueryState` | `useQueryStates` |
| --- | --- | --- |
| Binds | one key | a group |
| Returns | a `QueryStateRef` (`.value`, `.set`, `.clear`) | `{ values, setValues, clear }` |
| Per-param options | ✅ on `.set` / `.clear` | via `setValues` (whole batch) |
| Multi-param coalescing | — | ✅ |
| A ref to pass around | ✅ | [`toQueryRefs(values)`](/api/composables#toqueryrefs) |

Reach for `useQueryStates` when params move together; reach for `useQueryState`
when you want rich control over one param.
