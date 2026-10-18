# createDebugLogger <Badge type="info" text="@vuqs/core" />

Creates a namespaced logger for the vuqs debug stream, optionally targeting a binding's channel.

## Usage

```ts
import { createDebugLogger } from '@vuqs/core'

const log = createDebugLogger('catalog')
log.debug('loaded %s', 'products')
```

Inside a module, target the core's channel so the log carries the same binding and runtime as the module's writes:

```ts
import { createDebugLogger, defineQueryModule } from '@vuqs/core'

const withCatalog = defineQueryModule({
  states: (core) => {
    const log = createDebugLogger('catalog', { target: core.debug })
    log.debug('installed')

    return { api: {} }
  },
})
```

## Type

```ts
function createDebugLogger(namespace: string, options?: DebugLoggerOptions): DebugLogger
```

## Parameters

`namespace: string`, the source tag for emitted messages.

`options.target?: DebugChannelHandle`, the channel to write to, such as `core.debug`. Without it the logger writes to the global channel.

## Return value

`DebugLogger`. Its `debug` and `warn` methods emit `module:log` and `module:warn` events when diagnostics are armed. Literal message text is author-controlled; structured arguments follow the reporter payload policy.

## DebugLogger

```ts
interface DebugLogger {
  debug: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
}

interface DebugLoggerOptions {
  target?: DebugChannelHandle
}
```

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics#instrumenting-a-module).
