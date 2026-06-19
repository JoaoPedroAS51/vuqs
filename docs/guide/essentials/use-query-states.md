# useQueryStates

Binds a **group** of query keys at once. Use it when several params form one state
or require atomic batch writers.

```ts
import { codecs, useQueryStates } from '@vuqs/core'

const { values, patch, replace, clear } = useQueryStates({
  q: codecs.string.withDefault(''),
  sort: codecs.literal(['asc', 'desc'] as const).withDefault('asc'),
  page: codecs.integer.withDefault(1),
})
```

The argument is a [schema](/guide/essentials/concepts#schema-a-map-of-params): a
map of logical names to codecs. Each map key becomes the query key. Use
[`queryParam`](/guide/going-further/defining-params) for a param whose key differs
from its name, a [multi-key param](/guide/going-further/defining-params#composite-params),
or a builder modifier.

## Return value

```ts
interface UseQueryStatesApi {
  values: { q: string, sort: 'asc' | 'desc', page: number } // reactive, writable
  patch: (values: QueryStateWriteValues, options?: NavigateOptions) => void // partial write
  replace: (values: QueryStateValues, options?: NavigateOptions) => void // whole-state write
  clear: (options?: NavigateOptions) => void // reset all
}
```

### `values`: a reactive value map

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
values.q.trim() // string, no guard needed
values.page + 1 // number
```

A param without a default reads as `T | undefined`.

::: warning Replace, don't mutate
`values` tracks assignment, not in-place mutation. To change an array param,
assign a new array:

```ts
values.tags = [...values.tags, 'new'] // ✅ navigates
values.tags.push('new') // ❌ no navigation
```
:::

### Per-field refs with `toQueryRefs`

The grouped `values` map has no per-field `.set` or `.clear`. To create field refs
with those methods, project the composable with
[`toQueryRefs`](/api/composables#toqueryrefs):

```ts
import { toQueryRefs } from '@vuqs/core'

const query = useQueryStates(schema)
const { q, page } = toQueryRefs(query)

q.value = 'laptop' // write, like values.q = 'laptop'
page.set(2, { history: 'push' }) // per-call options, back on a field
q.clear() // remove ?q
```

Each ref writes through the same binding, so it inherits the same clearing
rule, including any default a [module](/modules/) layers on top. If you only need
one param, use `useQueryState` instead.

### Whole-object ref with `toQueryRef`

When the value *is* the whole state, such as a form model or an API request object,
[`toQueryRef`](/api/composables#toqueryref) binds the entire schema to a single
writable ref. Reading gives a plain snapshot (absent params omitted); assigning
**replaces** the state, clearing any param the assigned object leaves out or sets
to `undefined`:

```ts
import { toQueryRef } from '@vuqs/core'

const query = useQueryStates(schema)
const filters = toQueryRef(query)

filters.value = { q: 'laptop', sort: 'asc' } // set q + sort, clear page
filters.value = { q: 'laptop', page: undefined } // set q, clear page + sort
filters.value = { ...filters.value, page: 1 } // keep the object, set page
```

The snapshot keeps a stable reference while its content is unchanged, so binding it
with `v-model` on the whole object does not loop. Use `toQueryRefs` (plural) for
per-field refs, `toQueryRef` (singular) for the object as one value.

### `patch`: partial write

Updates some params in one atomic transaction, leaving the rest untouched. Each
param follows the three-state [write protocol](/guide/going-further/null-vs-undefined):

- **omit / `undefined`** leaves the param untouched.
- **`null`** clears the param, reverting to its default.
- **a value** sets it.

```ts
patch({ q: 'laptop', page: 1 }) // set q and page, leave sort alone
patch({ sort: null }) // clear sort
patch({ q: 'phone' }, { history: 'push' }) // with per-call options
```

`patch` uses `null` to distinguish "clear this one" from "don't touch this one."
Single refs clear via `.clear()` or `= undefined` instead, covered in
[null vs undefined](/guide/going-further/null-vs-undefined).

### `replace`: whole-state write

Sets the given params and **clears every param absent or explicitly `undefined`**,
in one atomic transaction. Absence and `undefined` are clear signals here, so
`replace` takes no `null`. Use it when the argument is the complete state,
such as applying a saved view:

```ts
replace({ q: 'laptop', sort: 'desc' }) // q + sort set, page cleared
replace({ q: 'laptop', page: undefined }) // q set, page + sort cleared
```

### `clear`: reset everything

```ts
clear() // every param back to its default, one navigation (replace({}))
clear({ history: 'push' }) // with options
```

## Coalescing: many writes, one navigation

Assigning several `values.*` in a row creates separate one-param transactions.
Calling `patch` with multiple keys creates one multi-param transaction. Both
produce exactly **one** history entry when they occur in the same coalescing
window:

```ts
function resetFilters() {
  values.q = ''
  values.sort = 'asc'
  values.page = 1
} // → a single navigation, not three
```

Several `useQueryState` calls using the same adapter coalesce too. Coalescing only
combines navigation; it does not merge those calls into one transaction. Prefer
`useQueryStates` when a write is one logical operation: `patch`, `replace`, and
`clear` apply their complete key set atomically before observers run.

## Composing modules

`useQueryStates` returns a composable with a `.use(module)` method. Each call runs
the [module](/modules/), merges its API onto the composable, and widens the return
type:

```ts
import { withRuntimeDefaults } from '@vuqs/core/modules'

const { values, setDefaults } = useQueryStates(schema)
  .use(withRuntimeDefaults())
```

## Grouped state example

```vue
<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'
import { computed } from 'vue'

const { values, patch, clear } = useQueryStates({
  q: codecs.string.withDefault(''),
  sort: codecs.literal(['asc', 'desc'] as const).withDefault('asc'),
  page: codecs.integer.withDefault(1),
})

const results = computed(() => runSearch(values.q, values.sort, values.page))

function search(term: string) {
  // A new search resets to page 1, in one navigation.
  patch({ q: term, page: 1 })
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
| Returns | a `QueryStateRef` (`.value`, `.set`, `.clear`) | `{ values, patch, replace, clear }` |
| Per-param options | ✅ on `.set` / `.clear` | via `patch` / `replace` (whole batch) |
| Multi-param coalescing | ✅ across calls in the same window | ✅ |
| Atomic batch API | — | ✅ `patch` / `replace` / `clear` |
| Compose a module | ✅ `.use()` | ✅ `.use()` |
| A ref to pass around | ✅ | [`toQueryRefs(query)`](/api/composables#toqueryrefs) |
