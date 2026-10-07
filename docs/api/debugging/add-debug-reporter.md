# addDebugReporter <Badge type="info" text="@vuqs/core" />

Attaches a consumer to the global debug stream or one adapter channel.

## Usage

```ts
import { addDebugReporter } from '@vuqs/core'

const stop = addDebugReporter(event => console.log(event.code))
stop()
```

## Type

```ts
function addDebugReporter(reporter: Reporter, options?: AddReporterOptions): () => void
```

## Parameters

`reporter: Reporter` and optional `AddReporterOptions`. `channel` restricts observation to one adapter; `replay: true` delivers retained history before live events.

## Return value

A disposer that detaches this reporter. Live events contain read-only raw references; replayed history is normalized and deeply frozen. Reporter failures are isolated.

## Reporter

```ts
type Reporter = (event: DebugEvent) => void
```

## ChannelReporterOptions

```ts
interface ChannelReporterOptions {
  replay?: boolean
}
```

## AddReporterOptions

```ts
interface AddReporterOptions extends ChannelReporterOptions {
  channel?: DebugChannelHandle
}
```

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#adapter-scoped-reporters).

`ChannelReporterOptions` and `ChannelHistoryOptions` are supporting channel
option interfaces, not exports from `@vuqs/core`.
