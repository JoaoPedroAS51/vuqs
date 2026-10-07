# createPerformanceReporter <Badge type="tip" text="@vuqs/core/debug/console" />

Creates a bounded User Timing projection without attaching it.

## Usage

```ts
import { addDebugReporter } from '@vuqs/core'
import { createPerformanceReporter } from '@vuqs/core/debug/console'

const reporter = createPerformanceReporter({ limit: 500 })
const stop = addDebugReporter(reporter)
reporter.clear()
stop()
```

## Type

```ts
function createPerformanceReporter(options?: PerformanceReporterOptions): PerformanceDebugReporter
```

## Parameters

Optional `PerformanceReporterOptions`. The default mark limit is `500`; `redact` and `previewLimits` customize bounded mark details.

## Return value

`PerformanceDebugReporter`, a reporter with `clear()`. Marks use reporter-specific names, so clearing removes only this reporter's marks. No durations are inferred.

## PerformanceReporterOptions

```ts
interface PerformanceReporterOptions {
  limit?: number
  redact?: DebugRedactor
  previewLimits?: Partial<NormalizeLimits>
}
```

## PerformanceDebugReporter

```ts
interface PerformanceDebugReporter extends Reporter {
  clear: () => void
}
```

<details>
<summary>Supporting option types</summary>

```ts
type DebugRedactor = (preview: unknown, event: DebugEvent) => unknown

interface NormalizeLimits {
  maxDepth: number
  maxProps: number
  maxItems: number
  maxStringLength: number
  maxNodes: number
}
```

These types describe option callbacks and bounds; they are not package exports.

</details>

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#user-timing).
