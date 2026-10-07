# addConsoleDebugReporter <Badge type="tip" text="@vuqs/core/debug/console" />

Creates and attaches an independently owned console reporter.

## Usage

```ts
import { addConsoleDebugReporter } from '@vuqs/core/debug/console'

const stop = addConsoleDebugReporter({ preset: 'trace' })
```

## Type

```ts
function addConsoleDebugReporter(options?: AddConsoleDebugReporterOptions): () => void
```

## Parameters

Optional `AddConsoleDebugReporterOptions`: console projection options plus an optional adapter channel.

## Return value

A disposer detaching this reporter. It does not replace the official projection managed by `enableDebug`.

## AddConsoleDebugReporterOptions

```ts
interface AddConsoleDebugReporterOptions extends ConsoleReporterOptions {
  channel?: DebugChannelHandle
}
```

## Related guide

[Debugging](/guide/debugging/console-output).
