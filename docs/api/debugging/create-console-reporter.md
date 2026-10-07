# createConsoleReporter <Badge type="tip" text="@vuqs/core/debug/console" />

Creates a console projection without attaching it or reading browser storage.

## Usage

```ts
import { addDebugReporter } from '@vuqs/core'
import { createConsoleReporter } from '@vuqs/core/debug/console'

const stop = addDebugReporter(createConsoleReporter({ preset: 'summary' }))
```

## Type

```ts
function createConsoleReporter(options?: ConsoleReporterOptions): Reporter
```

## Parameters

Optional `ConsoleReporterOptions`. `preset` defaults to `summary`; `payload` defaults to `preview`. Exclusion wins over inclusion. Filters run before normalization and redaction.

## Return value

`Reporter`. Preview payloads are bounded, detached, and redacted; `full` uses live raw references and bypasses preview redaction, while `hidden` prints the narrative only.

## ConsoleReporterOptions

```ts
interface ConsoleReporterOptions {
  preset?: ConsoleDebugPreset
  payload?: DebugPayloadMode
  filter?: DebugEventFilter
  redact?: DebugRedactor
  previewLimits?: Partial<NormalizeLimits>
}
```

## ConsoleDebugPreset

```ts
type ConsoleDebugPreset = 'summary' | 'trace'
```

## DebugPayloadMode

```ts
type DebugPayloadMode = 'preview' | 'full' | 'hidden'
```

## DebugEventFilter

```ts
interface DebugEventFilter {
  include?: DebugEventSelector
  exclude?: DebugEventSelector
}
```

## DebugEventSelector

```ts
interface DebugEventSelector {
  levels?: readonly DebugLevel[]
  scopes?: readonly string[]
  codes?: readonly string[]
  runtimeIds?: readonly string[]
  bindingIds?: readonly string[]
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

[Debugging](/guide/debugging/console-output).
