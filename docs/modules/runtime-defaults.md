# Runtime defaults

Layers runtime defaults *under* the bound query state, so they shape what the UI
reads without ever reaching the URL. It composes onto a group with `useQueryStates`
or onto a single param with `useQueryState`.

## Usage

`withRuntimeDefaults` composes on a group with `useQueryStates` or on a single param
with `useQueryState`, adding a grouped API to one and a per-param API to the other.

### On a group

```ts
import { useQueryStates } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'

const { values, explicitValues, defaults, setDefaults } = useQueryStates(schema)
  .use(withRuntimeDefaults())

setDefaults(await loadUserPreferences()) // runtime defaults, never written to the URL
values.status // reads through them: an explicit value if present, else the runtime default
```

### On a single param

```ts
import { codecs, useQueryState } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'

const perPage = useQueryState('perPage', codecs.integer)
  .use(withRuntimeDefaults())

perPage.setDefault(20)
perPage.value // the explicit value if present, else 20
```

See the [withRuntimeDefaults reference](/api/modules/with-runtime-defaults) for call forms, options, return values, and types.

## Signals

- **Emits:** none.
- **Reacts to** [`context:change`](/modules/signals): on a context change, it
  clears its runtime defaults, so a stale per-context default never bleeds through.
  Re-call `setDefaults`/`setDefault` after the switch, typically when the new
  context's data loads.

See [Composing built-in modules](/modules/composition) for the built-in
interaction that uses this signal.

## How it works

### Default precedence

`withRuntimeDefaults` registers a runtime-default layer on the core's
[layered defaults](/modules/authoring#layered-defaults). The codec defaults are the
base, the runtime defaults sit above them, and an explicit param value sits above
both. The bound `values` resolve through that stack, so `values` **is** the
effective read.

| State | Meaning |
| --- | --- |
| `explicitValues` | Decoded param values, including optimistic writes and the read pipeline, before engine default resolution. |
| `defaults` | Runtime defaults over codec defaults, with the read pipeline applied. |
| `values` | Values resolved against defaults, with the read pipeline applied. |

`explicitValues` can change before navigation completes. A read pipeline can also
remove or transform values, so this map is not a snapshot of the committed URL.
Object transforms may resolve static child defaults during decoding.

Objects resolve defaults per child. The engine applies the read pipeline separately
to explicit values and to values resolved against defaults.

Precedence runs **explicit value → runtime default → codec default**. An explicit value
always wins; clearing it reveals the runtime default, and clearing the runtime
default reveals the codec default, if the param has one. Your UI reads `values`.

### Writes use the resolved default

Because reads and writes share one notion of "the default", writing the codec
default while a *differing* runtime default exists persists the write instead of
clearing to the runtime default. For example, if the codec default is `usd` and
the runtime default is `eur`, assigning `values.currency = 'usd'` writes
`?currency=usd` and reads it back, rather than clearing to `eur`.
[`clearOnDefault`](/guide/query-state/navigation-options#clearondefault) only drops a
write that equals the *resolved* default, which here is `eur`.

### URL contents

- **Explicit values only.** The URL stores explicit values. Runtime defaults remain
  local, so a shared link uses the recipient's defaults for absent params.
- **Changing defaults.** If the runtime default for `perPage` changes from 20 to
  50, bookmarks without an explicit `perPage` use 50.

## Example

```vue
<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'
import { onMounted } from 'vue'

const { values, explicitValues, defaults, setDefaults, clear } = useQueryStates({
  q: codecs.string,
  status: codecs.literal(['active', 'archived'] as const),
  perPage: codecs.integer,
}).use(withRuntimeDefaults())

onMounted(async () => {
  // Saved preferences become the runtime defaults once they load.
  setDefaults(await loadUserPreferences())
})
</script>

<template>
  <p>Showing {{ values.perPage }} per page</p>

  <select
    :value="explicitValues.status ?? ''"
    @change="values.status = ($event.target as HTMLSelectElement).value || undefined"
  >
    <option value="">— (default: {{ defaults.status }})</option>
    <option value="active">active</option>
    <option value="archived">archived</option>
  </select>

  <button @click="clear()">Reset to defaults</button>
</template>
```

With no `?status` in the URL, `explicitValues.status` is `undefined`, `defaults.status`
is whatever `setDefaults` supplied, and `values.status` shows the default.
Selecting `archived` writes `?status=archived`; clearing it restores the default.

## Debugging

When [vuqs debug logging](/guide/debugging/enabling) is enabled, the module
logs under `[vuqs rd]`. The stream includes default-layer registration and
disposal, `setDefaults`/`clearDefaults`, and resets caused by `context:change`.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/configuration#autoimports), `withRuntimeDefaults` is auto-imported
with the other modules.
