# readStoredConsoleDebugConfig <Badge type="tip" text="@vuqs/core/debug/console" />

Reads and validates the versioned browser console configuration.

## Usage

```ts
import { readStoredConsoleDebugConfig } from '@vuqs/core/debug/console'

const resolution = readStoredConsoleDebugConfig()
resolution.status
```

## Type

```ts
function readStoredConsoleDebugConfig(): StoredConsoleDebugResolution
```

## Return value

A `StoredConsoleDebugResolution`. Missing configuration is absent; malformed or unsupported configuration fails closed. This read does not attach a reporter.

## StoredConsoleDebugResolution

```ts
type StoredConsoleDebugResolution
  = { readonly status: 'absent' | 'unavailable' | 'disabled' }
    | { readonly status: 'enabled', readonly options: StoredConsoleReporterOptions }
    | { readonly status: 'invalid', readonly message: string }
```

## StoredConsoleDebugConfig

```ts
interface StoredConsoleDebugConfig extends StoredConsoleReporterOptions {
  enabled: boolean
}
```

## StoredDebugConfigV1

```ts
interface StoredDebugConfigV1 {
  version: typeof VUQS_DEBUG_CONFIG_VERSION
  console?: StoredConsoleDebugConfig
}
```

## StoredConsoleReporterOptions

```ts
interface StoredConsoleReporterOptions {
  preset?: ConsoleDebugPreset
  payload?: StoredDebugPayloadMode
  filter?: StoredDebugEventFilter
}
```

## StoredDebugEventFilter

```ts
interface StoredDebugEventFilter {
  include?: StoredDebugEventSelector
  exclude?: StoredDebugEventSelector
}
```

## StoredDebugEventSelector

```ts
interface StoredDebugEventSelector {
  levels?: readonly DebugLevel[]
  scopes?: readonly DebugScope[]
  codes?: readonly DebugEventCode[]
}
```

## StoredDebugPayloadMode

```ts
type StoredDebugPayloadMode = 'preview' | 'hidden'
```

## Related guide

[Debugging](/guide/debugging/enabling#persistent-browser-configuration).
