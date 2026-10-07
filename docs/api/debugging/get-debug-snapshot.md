# getDebugSnapshot <Badge type="info" text="@vuqs/core" />

Describes current engine, queue, and storage state on demand.

## Usage

```ts
import { getDebugSnapshot } from '@vuqs/core'

const snapshot = getDebugSnapshot()
snapshot.engines
```

## Type

```ts
function getDebugSnapshot(channel?: DebugChannelHandle): DebugSnapshot
```

## Parameters

An optional channel handle limits the snapshot to one adapter runtime.

## Return value

`DebugSnapshot`, containing bounded detached subsystem descriptions. Snapshots are not redacted; apply an application redaction policy before transport or persistence.

## DebugSnapshot

```ts
interface DebugSnapshot {
  readonly engines: EngineSnapshot[]
  readonly queues: QueueSnapshot[]
  readonly storage: StorageSnapshot[]
}
```

## DebugSnapshotKind

```ts
type DebugSnapshotKind = 'engine' | 'queue' | 'storage'
```

## EngineSnapshot

```ts
interface EngineSnapshot {
  readonly runtimeId?: string
  readonly bindingId?: string
  readonly id: string
  readonly keys: readonly string[]
  readonly managedPaths: readonly string[]
  readonly committedSelected: Record<string, unknown>
  readonly optimisticSelected: Record<string, unknown>
  readonly values: Record<string, unknown>
  readonly defaults: Record<string, unknown>
}
```

## QueueSnapshot

```ts
interface QueueSnapshot {
  readonly runtimeId?: string
  readonly overlay: Record<string, unknown>
  readonly overlayKeys: readonly string[]
  readonly scheduled: boolean
}
```

## StorageSnapshot

```ts
interface StorageSnapshot {
  readonly runtimeId?: string
  readonly bindingId?: string
  readonly key: string
  readonly status: string
  readonly revision: number
}
```

## DebugSnapshotByKind

```ts
interface DebugSnapshotByKind {
  engine: EngineSnapshot
  queue: QueueSnapshot
  storage: StorageSnapshot
}
```

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#history-and-snapshots).

The following subsystem shapes are exported from the experimental
`@vuqs/core/debug-protocol` entry, governed by `DEBUG_PROTOCOL_VERSION`.
