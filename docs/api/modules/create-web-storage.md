# createWebStorage <Badge type="tip" text="@vuqs/core/modules" />

Creates a JSON-backed `QueryStorage` for browser `localStorage` or `sessionStorage`.

## Usage

```ts
import { createWebStorage } from '@vuqs/core/modules'

const storage = createWebStorage(() => window.localStorage)
```

## Type

```ts
function createWebStorage(resolveStorage: () => Storage | undefined): QueryStorage
```

## Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `resolveStorage` | `() => Storage \| undefined` | Lazy resolver, called for each operation. Return `undefined` when storage is unavailable. |

## Return value

[`QueryStorage`](/api/modules/with-storage#querystorage). Loads JSON snapshots and saves them with `JSON.stringify`. The lazy resolver permits browser globals inside the function without accessing them on import or adapter creation. JSON, resolver, and storage errors propagate to the caller; `withStorage` reports them through its controls.

## Related guide

[Storage](/modules/storage).
