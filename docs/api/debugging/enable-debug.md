# enableDebug <Badge type="tip" text="@vuqs/core/debug" />

Enables or replaces the independently owned official console projection.

## Usage

```ts
import { enableDebug } from '@vuqs/core/debug'

const stop = enableDebug({ preset: 'trace' })
stop()
```

## Type

```ts
function enableDebug(options?: EnableDebugOptions): () => void
```

## Parameters

Optional `EnableDebugOptions`, equivalent to `AddConsoleDebugReporterOptions`. Defaults to summary output and preview payloads.

## Return value

A generation-safe disposer. Calling `enableDebug` replaces the prior official projection; an older disposer cannot remove a newer one. Other reporters are unaffected. This call does not modify browser storage.

## EnableDebugOptions

```ts
type EnableDebugOptions = AddConsoleDebugReporterOptions
```

## Related guide

[Debugging](/guide/debugging/enabling).
