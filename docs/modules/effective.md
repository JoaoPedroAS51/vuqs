# withEffective <Badge type="tip" text="vuqs/modules" />

Layers runtime defaults *under* the bound query state, so they shape what the UI
reads without ever reaching the URL.

```ts
import { withEffective } from 'vuqs/modules'
```

## Overview

`withEffective` registers a runtime-default layer on the core's [layered
defaults](/modules/authoring#layered-defaults). The codec defaults are the base,
the runtime defaults (`setDefaults`) sit above them, and an explicit URL selection
sits above both. The bound `values` from [`useQueryStates`](/guide/use-query-states)
resolve through that stack, so `values` **is** the effective read — no separate
view.

| State | Source | In the URL? |
| --- | --- | --- |
| `selected` | explicit URL selections | ✅ yes — and *only* this |
| `defaults` | runtime defaults (`setDefaults`) over codec defaults | ❌ never |
| `values` | `selected` over `defaults` — the read model | derived |

```
values   = { ...defaults, ...selected }
defaults = { ...codecDefaults, ...runtimeDefaults }
```

Precedence runs **selection → runtime default → codec default**. A user selection
always wins; clearing it reveals the runtime default, and clearing the runtime
default reveals the codec default (if the param has one). Your UI reads `values`;
only `selected` is serialized.

`selected` and `defaults` are readonly reactive objects — dot access, no `.value`.
`values` is the writable map [`useQueryStates`](/guide/use-query-states) already
hands back:

```ts
const { values, selected, defaults } = useQueryStates(schema).use(withEffective())

selected.status // string | undefined — the explicit choice
defaults.status // the fallback in force
values.status   // what the UI shows
```

### Writing is coherent

Because reads and writes share one notion of "the default", writing the codec
default while a *differing* runtime default exists persists the write instead of
silently dropping to the runtime default. Say the codec default is `usd` and
`setDefaults` raised the runtime default to `eur`: assigning `values.currency =
'usd'` writes `?currency=usd` and reads it back, rather than clearing to `eur`.
[`clearOnDefault`](/guide/navigation-options#clearondefault) only drops a write
that equals the *resolved* default, which here is `eur`.

### Why runtime defaults stay out of the URL

- **Honest links.** The URL captures what the user *chose*, not what their account
  happens to default to. A shared link reproduces the selection; the recipient's
  own defaults fill the rest.
- **Defaults can change.** If the runtime default for `perPage` moves from 20 to
  50, every user sees 50 immediately — no stale `?perPage=20` baked into bookmarks.

## API

`withEffective()` takes no options and contributes `EffectiveApi`:

```ts
function withEffective(): QueryModule<TSchema, EffectiveApi<TSchema>>

interface EffectiveApi<TSchema> {
  selected: Readonly<QueryStateValues<TSchema>>
  defaults: Readonly<QueryStateValues<TSchema>>
  setDefaults: (values: QueryStateValues<TSchema>) => void
  clearDefaults: () => void
}
```

- `setDefaults(values)` — **replace** the runtime defaults with a snapshot. It
  doesn't merge. These feed `defaults` and the resolved `values`, but are never
  written to the URL.
- `clearDefaults()` — drop the runtime defaults, leaving codec defaults in place.

The effective read is the base [`values`](/guide/use-query-states#values-a-reactive-value-map)
map. Writes still go through the base composable: assign `values.field` or call
`setValues(...)`. For per-field refs that keep `.set`/`.clear`, explode `values`
with [`toQueryRefs`](/api/composables#toqueryrefs).

## Example

```vue
<script setup lang="ts">
import { codecs, defineQueryParam, useQueryStates } from 'vuqs'
import { withEffective } from 'vuqs/modules'
import { onMounted } from 'vue'

const { values, selected, defaults, setDefaults, clear } = useQueryStates({
  q: defineQueryParam('q', codecs.string),
  status: defineQueryParam('status', codecs.literal(['active', 'archived'] as const)),
  perPage: defineQueryParam('perPage', codecs.integer),
}).use(withEffective())

onMounted(async () => {
  // Saved preferences become the runtime defaults once they load.
  setDefaults(await loadUserPreferences())
})
</script>

<template>
  <p>Showing {{ values.perPage }} per page</p>

  <select
    :value="selected.status ?? ''"
    @change="values.status = ($event.target as HTMLSelectElement).value || undefined"
  >
    <option value="">— (default: {{ defaults.status }})</option>
    <option value="active">active</option>
    <option value="archived">archived</option>
  </select>

  <button @click="clear()">Reset to defaults</button>
</template>
```

With no `?status` in the URL, `selected.status` is `undefined`, `defaults.status`
is whatever `setDefaults` supplied, and `values.status` shows the default. The
moment the user picks `archived`, `?status=archived` appears and `values` follows
the choice; clear it and `values` falls back again.

## Composing

Runtime defaults are per-context. When you also apply
[`withContext`](/modules/context), `withEffective` clears its runtime defaults on a
context change — so a stale default from the previous tab never bleeds through.
Re-call `setDefaults` after the switch, typically when the new context's data
loads. The two modules coordinate through `core` with no direct dependency.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/introduction#auto-imports), `withEffective` is
auto-imported with the other modules — drop the `import` line and call it directly.

Next: **[withContext →](/modules/context)**
