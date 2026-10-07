# Programmatic diagnostics

Observe one adapter runtime, replay retained events, or inspect its current state through the debug bus.

## Adapter-scoped reporters

Pass the adapter used by your query bindings to this application helper:

```ts
import type { QueryAdapter } from '@vuqs/core'
import { addDebugReporter, getDebugChannel } from '@vuqs/core'

export function observeQuery(adapter: QueryAdapter): () => void {
  const channel = getDebugChannel(adapter)
  return addDebugReporter((event) => {
    console.log(event.code, event.context, event.data)
  }, { channel })
}
```

Call the returned disposer when the integration ends. Multiple reporters coexist independently.

Omitting `channel` observes the global stream. For SSR isolation, use a distinct adapter identity per request and attach reporters to that adapter's channel. The [Nuxt integration](/guide/debugging/enabling#nuxt) handles its reporter lifecycle automatically.

## History and snapshots

A history lease retains events for a later reporter. A snapshot describes current state rather than replaying the operations that produced it:

```ts
import type { QueryAdapter } from '@vuqs/core'
import { addDebugReporter, getDebugChannel, getDebugSnapshot, retainDebugHistory } from '@vuqs/core'

export function captureQuery(adapter: QueryAdapter) {
  const channel = getDebugChannel(adapter)
  const releaseHistory = retainDebugHistory({ channel, limit: 100 })

  return {
    attach: () => addDebugReporter((event) => {
      console.log(event.code, event.data)
    }, { channel, replay: true }),
    snapshot: () => getDebugSnapshot(channel),
    dispose: releaseHistory,
  }
}
```

Each `attach()` call returns its own reporter disposer. Release the history lease separately when capture ends. A zero, negative, or `NaN` limit does not arm history.

Snapshots include binding-owned engine and storage state and the adapter queue. Apply [payload redaction](/guide/debugging/payloads#history-and-snapshots) before transporting or persisting captured records.

## Instrumenting a module

```ts
import { createDebugLogger } from '@vuqs/core'

const log = createDebugLogger('catalog')
log.debug('Loaded %s', 'products')
log.warn('Could not resolve %s', 'category')
```

These calls produce `module:log` and `module:warn` events on the global debug channel. Console reporters, retained history, and custom global reporters can observe them.

## User Timing

Console logging never creates `performance.mark` entries. User Timing is a separate,
bounded, opt-in reporter:

```ts
import { addDebugReporter } from '@vuqs/core'
import { createPerformanceReporter } from '@vuqs/core/debug/console'

const performanceReporter = createPerformanceReporter({ limit: 500 })
const stop = addDebugReporter(performanceReporter)

performanceReporter.clear()
stop()
```

Marks are named `vuqs:r<reporter-id>:<event-code>` and include sequence, level, scope,
context and a bounded/redacted detail. The per-reporter id restricts each reporter to
clearing its own marks when the limit is reached. Marks describe individual events; the reporter does not infer operation durations.

## Parse diagnostics

Malformed URL values produce a binding-attributed `engine:parse-miss` warning when the engine reads them. Codecs remain pure: calling `codec.parse()` directly does not log.

See [addDebugReporter](/api/debugging/add-debug-reporter),
[retainDebugHistory](/api/debugging/retain-debug-history),
[getDebugSnapshot](/api/debugging/get-debug-snapshot), and the
[event reference](/api/debug-events) for the observation contracts.
