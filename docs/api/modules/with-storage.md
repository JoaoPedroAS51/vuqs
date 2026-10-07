# withStorage <Badge type="tip" text="@vuqs/core/modules" />

Mirrors explicit query selections to storage and can restore a snapshot into an empty selection.

## Usage

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { createWebStorage, withStorage } from '@vuqs/core/modules'

const query = useQueryStates({ q: codecs.string })
  .use(withStorage({
    key: 'catalog:filters',
    storage: createWebStorage(() => window.localStorage),
  }))

await query.storage.ready
query.storage.status.value
```

## Type

```ts
declare const withStorage: QueryModuleFactory<'vuqs:storage'>
```

`QueryModuleFactory` is the inferred factory type, not a package export.
See [Factory call forms](/api/authoring/define-query-module#factory-call-forms)
for adaptive, schema, param, and path calls.

## Parameters

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `key` | `string` | Required | Storage key for the snapshot. |
| `storage` | `QueryStorage` | Required | Synchronous or asynchronous storage implementation. |
| `restore` | `StorageRestorePolicy` | `'if-empty'` | Restore only into an empty selection, or mirror without loading with `'never'`. |
| `version` | `string` | Absent | Rejects snapshots with a different application version. |

Invalid options or a malformed storage contract throw synchronously during `.use()`.

## Return value

A module contributing the same `StorageApi` on either facade. Controls are available at `query.storage`.

| Control | Type | Behavior |
| --- | --- | --- |
| `status` | `ComputedRef<StorageStatus>` | Latest lifecycle outcome. |
| `error` | `ShallowRef<unknown \| undefined>` | Latest operational failure; cleared after a successful write. |
| `ready` | `Promise<void>` | Settles after initialization reaches a stable mirror. |
| `flush` | `() => Promise<void>` | Waits for writes requested through the point of the call, including initialization. |

`ready` and `flush()` resolve after operational failures. Inspect `status.value` and `error.value` for the outcome; neither promise is an error channel.

## Restore and lifecycle

A non-empty URL or a write intent during loading wins over storage. A valid stored selection restores with one whole-state write only when the URL remains empty. Explicit values equal to defaults are preserved; resolved defaults are not persisted. An empty mirror removes its storage key.

On the server, storage is not read and `ready` resolves. Restoration starts after mount in a component, or on a microtask outside one. Scope disposal stops observation and prevents late results from restoring or updating module state.


## StorageOptions

```ts
interface StorageOptions {
  key: string
  storage: QueryStorage
  restore?: StorageRestorePolicy
  version?: string
}
```

## StorageRestorePolicy

```ts
type StorageRestorePolicy = 'if-empty' | 'never'
```

## StorageApi

```ts
interface StorageApi {
  storage: StorageControls
}
```

## StorageControls

```ts
interface StorageControls {
  status: ComputedRef<StorageStatus>
  error: ShallowRef<unknown | undefined>
  ready: Promise<void>
  flush: () => Promise<void>
}
```

## StorageStatus

```ts
type StorageStatus = 'restoring' | 'ready' | 'error'
```

## QueryStorage

```ts
interface QueryStorage {
  load: (key: string) => Awaitable<StoredQuerySnapshot | undefined>
  save: (key: string, snapshot: StoredQuerySnapshot) => Awaitable<void>
  remove: (key: string) => Awaitable<void>
}
```

## Awaitable

```ts
type Awaitable<T> = T | PromiseLike<T>
```

## StoredQuerySnapshot

```ts
interface StoredQuerySnapshot {
  format: 1
  version?: string
  savedAt: number
  query: ParsedQueryRaw
}
```

## Related guide

[Storage](/modules/storage).
