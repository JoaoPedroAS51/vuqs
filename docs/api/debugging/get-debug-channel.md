# getDebugChannel <Badge type="info" text="@vuqs/core" />

Returns the observation channel associated with an adapter identity.

## Usage

```ts
import { getDebugChannel } from '@vuqs/core'
import { createTestingAdapter } from '@vuqs/core/adapters/testing'

const channel = getDebugChannel(createTestingAdapter())
```

## Type

```ts
function getDebugChannel(adapter: QueryAdapter): DebugChannelHandle
```

## Parameters

`adapter: QueryAdapter`. Adapter identity determines the runtime boundary.

## Return value

`DebugChannelHandle`. Use it to scope reporters, history, and snapshots to one adapter. Distinct adapter objects have distinct channels.

## DebugChannelHandle

```ts
interface DebugChannelHandle {
  readonly runtimeId?: string
  addReporter: (reporter: Reporter, options?: ChannelReporterOptions) => () => void
  retainHistory: (options?: ChannelHistoryOptions) => () => void
  registerSnapshotSource: <Kind extends DebugSnapshotKind>(kind: Kind, describe: () => DebugSnapshotByKind[Kind]) => () => void
}
```

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#adapter-scoped-reporters).
