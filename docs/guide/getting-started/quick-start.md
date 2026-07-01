# Quick start

::: info Prerequisite
This assumes an [adapter](/guide/getting-started/adapters) is provided near the
root of your app. Without one, the composables below throw.
:::

## One param

[`useQueryState`](/guide/essentials/use-query-state) binds a single query key to a
writable ref. Pass the key and a [codec](/guide/codecs/built-in) describing its
type:

```vue
<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'

const search = useQueryState('q', codecs.string.withDefault(''))
//    ^? QueryStateRef<string>
</script>

<template>
  <input v-model="search" placeholder="Search…">
  <p>You searched: {{ search }}</p>
</template>
```

The ref is an ordinary Vue ref bound to the `q` key, so `v-model`, `computed`, and
`watch` all work. `v-model` writes the ref, and the ref writes the URL.

`.withDefault('')` does two things: it makes the ref non-nullable, and it keeps the
default out of the URL.

| URL | `search` |
| --- | --- |
| `/` | `''` (the default) |
| `/?q=` | `''` |
| `/?q=vue` | `'vue'` |

## A group of params

Most filter UIs have several keys that change together.
[`useQueryStates`](/guide/essentials/use-query-states) binds a whole group and
returns a reactive `values` map plus batch writers. Each entry is a codec, with
the map key used as the query key:

```vue
<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'

const { values, clear } = useQueryStates({
  q: codecs.string.withDefault(''),
  sort: codecs.literal(['asc', 'desc'] as const).withDefault('asc'),
  page: codecs.integer.withDefault(1),
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

::: tip
`values` is a reactive map. To work with params as individual refs, convert it
with [`toQueryRefs`](/guide/essentials/use-query-states#per-field-refs).
:::

## Next steps

- [Concepts](/guide/essentials/concepts): the mental model behind codecs, params, and the commit cycle.
- [Built-in codecs](/guide/codecs/built-in): every type vuqs ships, and how to build your own.
- [Navigation & options](/guide/essentials/navigation-options): `push` vs `replace`, throttling, and option precedence.
- [Modules](/modules/): opt-in behavior composed onto `useQueryStates` when URL state alone is not enough.
