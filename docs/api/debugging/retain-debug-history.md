# retainDebugHistory <Badge type="info" text="@vuqs/core" />

Retains a bounded history while the returned lease is active.

## Usage

```ts
import { retainDebugHistory } from '@vuqs/core'

const stop = retainDebugHistory({ limit: 100 })
stop()
```

## Type

```ts
function retainDebugHistory(options?: RetainHistoryOptions): () => void
```

## Parameters

Optional `RetainHistoryOptions`: `channel` selects an adapter channel; `limit` bounds retained events. Zero, negative, or `NaN` limits do not arm history.

## Return value

A disposer releasing this history lease. Stored events are detached and deeply frozen. Normalization does not redact application data.

## ChannelHistoryOptions

```ts
interface ChannelHistoryOptions {
  limit?: number
}
```

## RetainHistoryOptions

```ts
interface RetainHistoryOptions extends ChannelHistoryOptions {
  channel?: DebugChannelHandle
}
```

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#history-and-snapshots).

`ChannelReporterOptions` and `ChannelHistoryOptions` are supporting channel
option interfaces, not exports from `@vuqs/core`.
