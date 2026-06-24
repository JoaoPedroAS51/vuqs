# withEffective

Separates a field's value into three layers so runtime defaults can sit *under*
explicit selections without ever reaching the URL.

```ts
import { withEffective } from 'vuqs/modules'
```

## What it adds

Instead of one value per field, `withEffective` exposes three read models plus two
writers for the runtime defaults:

| State | Source | In the URL? |
| --- | --- | --- |
| `selected` | explicit URL selections | ✅ yes — and *only* this |
| `defaults` | runtime defaults (`setDefaults`) layered over codec defaults | ❌ never |
| `effective` | `selected` layered over `defaults` — the read model | derived |

```
effective = { ...defaults, ...selected }
defaults  = { ...codecDefaults, ...runtimeDefaults }
```

Precedence runs **selection → runtime default → codec default**. A user selection
always wins; clearing it reveals the runtime default, and clearing the runtime
default reveals the codec default (if the field has one). Your UI reads
`effective`; only `selected` is serialized.

All three are readonly reactive objects — dot access, no `.value`:

```ts
const { selected, defaults, effective } = q

selected.status   // string | undefined — the explicit choice
defaults.status   // the fallback in force
effective.status  // what the UI shows
```

## API

```ts
interface EffectiveApi<TSchema> {
  selected: Readonly<QueryStateValues<TSchema>>
  defaults: Readonly<QueryStateValues<TSchema>>
  effective: Readonly<QueryStateValues<TSchema>>
  setDefaults: (values: QueryStateValues<TSchema>) => void
  clearDefaults: () => void
}
```

- `setDefaults(values)` — **replace** the runtime defaults with a snapshot. It
  doesn't merge. These feed `defaults`/`effective` but are never written to the URL.
- `clearDefaults()` — drop the runtime defaults, leaving codec defaults in place.

Writes still go through the base composable: assign `values.field` or call
`setValues(...)`. `selected`/`defaults`/`effective` are the read side.

## Why keep runtime defaults out of the URL

- **Honest links.** The URL captures what the user *chose*, not what their account
  happens to default to. A shared link reproduces the selection; the recipient's
  own defaults fill the rest.
- **Defaults can change.** If the runtime default for `perPage` moves from 20 to
  50, every user sees 50 immediately — no stale `?perPage=20` baked into bookmarks.

## Example

```vue
<script setup lang="ts">
import { codecs, defineQueryState, useQueryStates } from 'vuqs'
import { withEffective } from 'vuqs/modules'
import { onMounted } from 'vue'

const { values, selected, defaults, effective, setDefaults, clear } = useQueryStates({
  q: defineQueryState('q', codecs.string),
  status: defineQueryState('status', codecs.literal(['active', 'archived'] as const)),
  perPage: defineQueryState('perPage', codecs.integer),
}).use(withEffective())

onMounted(async () => {
  // Saved preferences become the runtime defaults once they load.
  setDefaults(await loadUserPreferences())
})
</script>

<template>
  <p>Showing {{ effective.perPage }} per page</p>

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
is whatever `setDefaults` supplied, and `effective.status` shows the default. The
moment the user picks `archived`, `?status=archived` appears and `effective`
follows the choice; clear it and `effective` falls back again.

## Pairing with `withContext`

Runtime defaults are per-context. When you also apply
[`withContext`](/modules/context), `withEffective` clears its runtime defaults on a
context change — so a stale default from the previous tab never bleeds through.
Re-call `setDefaults` after the switch, typically when the new context's data
loads. The two modules coordinate through `core` with no direct dependency.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/introduction#auto-imports), `withEffective` is
auto-imported with the other modules — drop the `import` line and call it directly.

Next: **[withContext →](/modules/context)**
