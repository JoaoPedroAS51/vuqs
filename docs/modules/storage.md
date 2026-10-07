# Storage

Mirrors the explicit query selection to sync or async storage and can restore it
into an empty URL. Storage is a durable mirror of URL state, not a default layer.

## Usage

`withStorage` composes on a group with `useQueryStates` or on a single param with
`useQueryState`. Both expose the same `storage` controls and accept the same
options.

### On a group

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { createWebStorage, withStorage } from '@vuqs/core/modules'

const { storage } = useQueryStates({
  q: codecs.string,
  page: codecs.integer,
}).use(withStorage({
  key: 'catalog:filters',
  storage: createWebStorage(() => window.localStorage),
  version: '1',
}))

await storage.ready
```

### On a single param

```ts
import { codecs, useQueryState } from '@vuqs/core'
import { createWebStorage, withStorage } from '@vuqs/core/modules'

const search = useQueryState('q', codecs.string)
  .use(withStorage({
    key: 'catalog:search',
    storage: createWebStorage(() => window.localStorage),
  }))

await search.storage.ready
```

See the [withStorage reference](/api/modules/with-storage) for call forms, options, return values, and types.

## Signals

- **Emits:** none.
- **Reacts to:** none.

The module coordinates with query writes through the transaction boundary, not a
signal. See [Composing built-in modules](/modules/composition) for its material
built-in interactions.

## How it works

### Restore rules

`if-empty` applies one deterministic winner. It never partially merges URL and
stored params.

| State when loading settles | Result |
| --- | --- |
| URL selection is non-empty | URL wins and replaces the stored mirror |
| A write intent occurred during `load` | Current URL state wins, including a no-op clear |
| URL is empty and the snapshot is valid | The whole snapshot is restored with one `replace` transaction |
| URL is empty and storage has no snapshot | The URL stays empty |
| Snapshot or load is invalid | The URL stays unchanged and the controls report an error |

With `restore: 'never'`, the module does not call `load`. It mirrors the current
selection immediately.

### Exact mirror

The module persists the explicit selection after the read pipeline, serialized
through the schema:

The snapshot uses the [`StoredQuerySnapshot`](/api/modules/with-storage#storedquerysnapshot) envelope.

Only explicit selections are included, including explicitly present values equal
to a default. Codec defaults, registered default layers, and resolved `values`
are never persisted. An empty selection removes the storage key instead of saving
an empty envelope.

Restoration writes the stored selection back into the URL. Explicit presence is
preserved even when a stored value equals the current resolved default, so a
later default change cannot reinterpret that selection. The restored selection
runs through the write pipeline, reaches the URL, then runs through the read
pipeline again.

### Write scheduling

The write pump runs at most one storage operation at a time. If state changes
while a write is in flight, intermediate snapshots coalesce and the latest
selection wins. Initialization rechecks the source after its first write, so
`ready` cannot settle with a stale initial mirror.

### Operational errors

`ready` and `flush()` resolve after an operational failure. They are lifecycle
gates, not error channels. Read `status.value` and `error.value` for the outcome.

| Failure | Behavior |
| --- | --- |
| Invalid options or storage contract | Throws synchronously during `.use()` |
| `load`, `save`, or `remove` fails | Promise resolves; `status` becomes `error` |
| Snapshot is invalid or incompatible | `ready` resolves; URL stays unchanged; `status` becomes `error` |

### SSR and lifecycle

On the server, storage is not read and `ready` resolves with URL state unchanged.
In a component, restoration begins after mount. Outside a component, it begins on
a microtask so the complete synchronous `.use()` chain can register its layers
and transforms first.

Disposing the owning scope stops observation. A late async result cannot restore
or update module state after disposal.

## Example

```ts
const query = useQueryStates(schema).use(withStorage({
  key: 'catalog:filters',
  storage: createWebStorage(() => window.localStorage),
}))

await query.storage.ready

if (query.storage.status.value === 'error') {
  reportStorageError(query.storage.error.value)
}

await loadProducts({ ...query.values })

query.patch({ q: 'phone' })
await query.storage.flush()
```

`ready` gates work that needs the restored URL state. `flush()` gates work that
needs storage to reflect the writes requested before that call.

## Debugging

When [vuqs debug logging](/guide/debugging/enabling) is enabled, the module
logs under `[vuqs storage]`. The stream includes the restore policy and winner,
`save`/`remove` operations with revisions, coalesced writes, and operational
failures.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/configuration#autoimports), `withStorage` is auto-imported. Import
`createWebStorage` from `@vuqs/core/modules`, or provide your own `QueryStorage`.
