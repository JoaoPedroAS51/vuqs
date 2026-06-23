# The three states

The store splits a field's value into three layers. Understanding them is the
whole point of `@vuqs/store`.

| State | What it is | Serialized to URL? |
| --- | --- | --- |
| **`selected`** | the user's explicit choices, mirrored from the URL | ✅ yes — and *only* this |
| **`defaults`** | values supplied via `setDefaults` | ❌ never |
| **`effective`** | `selected` layered over `defaults` — what the UI reads | derived, not stored |

```
effective = { ...defaults, ...selected }
```

A user selection always wins over a default. Clearing a selection reveals the
default beneath it.

## Create a store

```ts
import { createQueryStore } from '@vuqs/store'
import { codecs, defineQueryState } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'

const adapter = createVueRouterAdapter()

const store = createQueryStore({
  schema: {
    q: defineQueryState('q', codecs.string),
    status: defineQueryState('status', codecs.literal(['active', 'archived'] as const)),
    perPage: defineQueryState('perPage', codecs.integer),
  },
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
})
```

::: warning Use plain codecs, not `.withDefault()`
In a store, defaults come from `setDefaults`, not the codec. A codec
`.withDefault()` would shadow those runtime defaults in `effective`. So store schemas
use **bare** codecs — `codecs.integer`, not `codecs.integer.withDefault(20)`.
:::

## Read the states

`selected`, `defaults`, and `effective` are **readonly reactive objects** — dot
access, no `.value`:

```ts
store.selected.q     // string | undefined
store.effective.perPage
```

```vue
<template>
  <p>Showing {{ store.effective.perPage }} per page</p>
  <ul>
    <li v-for="row in rows" :key="row.id">{{ row.name }}</li>
  </ul>
</template>
```

Your UI and data fetching read `effective`. `selected` is mainly for debugging or
rendering "you've changed these" affordances.

## Write selections

```ts
// Set one field
store.setValue('status', 'archived')
store.setValue('q', 'laptop', { history: 'push' }) // with per-call options

// Clear one field → reverts to its default
store.setValue('status', undefined)

// Batch — null clears, undefined/absent skips, value sets
store.setValues({ q: 'phone', status: null })

// Clear every selection (each reverts to its default)
store.clear()
```

Writes go through the same [committed model](/guide/concepts#the-commit-cycle) and
[navigation options](/guide/navigation-options) as the core. `setValue` (single)
clears with `undefined`; `setValues` (batch) clears with `null` — see
[null vs undefined](/guide/null-vs-undefined).

## Load defaults

`setDefaults` replaces the defaults with a snapshot. These feed `effective` and
the UI but are **never** written to the URL:

```ts
import { onMounted } from 'vue'

onMounted(async () => {
  const defaults = await loadUserPreferences()
  store.setDefaults(defaults)
})
```

Now, with no `?status` in the URL:

```ts
store.selected.status  // undefined  (the user hasn't chosen)
store.defaults.status  // 'active'   (from defaults)
store.effective.status // 'active'   (what the UI shows)
```

The moment the user picks `archived`, `selected.status` becomes `'archived'`,
`?status=archived` appears in the URL, and `effective` reflects the choice.
Clear it, and `effective` falls back to `'active'` again.

`setDefaults` **replaces** (it's a snapshot), it doesn't merge. `clearDefaults()`
removes them all.

## Why keep defaults out of the URL?

Two reasons:

1. **Clean, honest links.** The URL should capture what the user *chose*, not what
   their account happens to default to. A shared link reproduces the *selection*,
   and the recipient's own defaults fill the rest.
2. **Defaults can change.** If the runtime default for `perPage` changes from 20 to 50,
   every user immediately sees 50 — without stale `?perPage=20` baked into a
   thousand bookmarks.

## Build a URL without navigating

`buildQuery` produces the query for the current selection without navigating —
handy for rendering a link or computing a redirect:

```ts
const query = store.buildQuery(route.query)
```

Only `selected` is serialized, so the result never contains a default.

## Full example

```vue
<script setup lang="ts">
import { createQueryStore } from '@vuqs/store'
import { codecs, defineQueryState } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { onMounted } from 'vue'

const adapter = createVueRouterAdapter()

const store = createQueryStore({
  schema: {
    q: defineQueryState('q', codecs.string),
    status: defineQueryState('status', codecs.literal(['active', 'archived'] as const)),
    perPage: defineQueryState('perPage', codecs.integer),
  },
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
})

onMounted(() => {
  // Pretend saved preferences are available at runtime.
  store.setDefaults({ q: '', status: 'active', perPage: 20 })
})
</script>

<template>
  <input
    :value="store.selected.q ?? ''"
    placeholder="Search…"
    @input="store.setValue('q', ($event.target as HTMLInputElement).value || undefined)"
  >

  <select :value="store.selected.status ?? ''" @change="/* setValue('status', …) */">
    <option value="">— (default: {{ store.defaults.status }})</option>
    <option value="active">active</option>
    <option value="archived">archived</option>
  </select>

  <button @click="store.clear()">Reset to defaults</button>

  <pre>selected:  {{ store.selected }}</pre>
  <pre>defaults:  {{ store.defaults }}</pre>
  <pre>effective: {{ store.effective }}</pre>
</template>
```

Next: **[Context switching →](/store/context)** — preserve and reset filters
across tabs.
