# useQueryStates

Binds a **group** of query keys at once. Use it for a filter bar, a search +
sort + page trio, anything where several keys change together and you want
multi-field writes to land as a single navigation.

```ts
import { codecs, defineQueryState, useQueryStates } from 'vuqs'

const { values, setValues, clear } = useQueryStates({
  q: defineQueryState('q', codecs.string.withDefault('')),
  sort: defineQueryState('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryState('page', codecs.integer.withDefault(1)),
})
```

The argument is a [schema](/guide/concepts#schema-a-map-of-fields): a map of
logical names to [fields](/guide/defining-fields).

## What you get back

```ts
{
  values: { q: string; sort: 'asc' | 'desc'; page: number }  // reactive, writable
  setValues: (values, options?) => void                       // batch write
  clear: (options?) => void                                   // reset all
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

Fields declaring a `.withDefault()` are **non-nullable** in `values`, so reads
need no `?? fallback`:

```ts
values.q.trim()   // string — no guard needed
values.page + 1   // number
```

A field without a default reads as `T | undefined`.

::: warning Replace, don't mutate
`values` tracks assignment, not in-place mutation. To change an array field,
assign a new array:

```ts
values.tags = [...values.tags, 'new'] // ✅ navigates
values.tags.push('new')               // ❌ no navigation
```
:::

Need an individual ref to pass around? Use Vue's `toRefs(values)`.

### `setValues` — batch write

Sets several fields in one coalesced navigation. Each field follows the
three-state [write protocol](/guide/null-vs-undefined):

- **omit / `undefined`** → leave the field untouched
- **`null`** → clear the field (revert to default)
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
clear()                      // every field back to its default, one navigation
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
import { codecs, defineQueryState, useQueryStates } from 'vuqs'
import { computed } from 'vue'

const { values, setValues, clear } = useQueryStates({
  q: defineQueryState('q', codecs.string.withDefault('')),
  sort: defineQueryState('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryState('page', codecs.integer.withDefault(1)),
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
| Per-field options | ✅ on `.set` / `.clear` | via `setValues` (whole batch) |
| Multi-field coalescing | — | ✅ |
| A ref to pass around | ✅ | `toRefs(values)` |

Reach for `useQueryStates` when fields move together; reach for `useQueryState`
when you want rich control over one field.
