# createDebugLogger <Badge type="info" text="@vuqs/core" />

Creates a namespaced logger for the global vuqs debug stream.

## Usage

```ts
import { createDebugLogger } from '@vuqs/core'

const log = createDebugLogger('catalog')
log.debug('loaded %s', 'products')
```

## Type

```ts
function createDebugLogger(namespace: string): DebugLogger
```

## Parameters

`namespace: string`, the source tag for emitted messages.

## Return value

`DebugLogger`. Its `debug` and `warn` methods emit `module:log` and `module:warn` events when diagnostics are armed. Literal message text is author-controlled; structured arguments follow the reporter payload policy.

## DebugLogger

```ts
interface DebugLogger {
  debug: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
}
```

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#instrumenting-a-module).
