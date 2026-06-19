# Debugging

vuqs exposes one structured debug bus and two opt-in projections:

- a human-oriented console summary;
- a complete trace for low-level investigation.

The console code lives outside the base bundle until the debug entry is imported:

```ts
import '@vuqs/core/debug'
```

## Enabling

The side-effecting entry reads one versioned browser configuration from
`localStorage['vuqs:debug']`:

```ts
localStorage.setItem('vuqs:debug', JSON.stringify({
  version: 1,
  console: { enabled: true },
}))
location.reload()
```

For example, a persistent trace restricted to queue and adapter events is:

```ts
localStorage.setItem('vuqs:debug', JSON.stringify({
  version: 1,
  console: {
    enabled: true,
    preset: 'trace',
    payload: 'preview',
    filter: {
      include: { scopes: ['gtq', 'adapter'] },
      exclude: { codes: ['gtq:schedule'] },
    },
  },
}))
location.reload()
```

With `console.enabled: true`, omitted settings default to `preset: 'summary'`,
`payload: 'preview'`, and no filter. Persisted selectors support stable `levels`,
`scopes`, and `codes`. Runtime and binding ids are intentionally programmatic because
they can change after a reload.

Only `preview` and `hidden` are accepted as persisted payload modes. Raw `full` payloads,
custom redaction, preview limits, and adapter channels require programmatic control. An
invalid or unknown configuration version fails closed with one warning. Reading never
rewrites or migrates storage, and changes take effect after a reload.

The entry never auto-enables a process-global reporter on the server: that would mix
diagnostics across concurrent requests. Server integrations must attach the pure
reporter to a request adapter channel, as the Nuxt integration below does.

Programmatic control can configure the projection directly:

```ts
import { disableDebug, enableDebug } from '@vuqs/core/debug'

const stop = enableDebug({
  preset: 'summary',
})

stop() // owns only this generation
disableDebug() // removes only the official console projection
```

Calling `enableDebug()` again replaces the prior configuration without duplicating
logs. An older disposer cannot detach a newer configuration. Reporters attached through
the bus are independent. `enableDebug()` and `disableDebug()` affect only the current
session and never mutate `localStorage`.

::: warning Browser DevTools imports
`import('@vuqs/core/debug')` typed directly into a browser console is a bare package
specifier and normally cannot be resolved without an import map. Import the entry from
application source, use the Nuxt option below, or expose your own development command.
:::

## Summary and trace

`summary` is the default. It shows committed state changes and failures while omitting
internal callbacks. One committed write normally reads as one result:

```text
[vuqs] Updated the URL: "color" = "green".
```

Queue enqueue/schedule plumbing, hook dispatch, pipeline registration and binding
lifecycle stay hidden. A failed navigation instead explains the rollback:

```text
[vuqs] Could not update the URL; restored the previous value of "color".
```

Warnings, module decisions with summary messages, and explicit module logs remain visible.

A committed URL change with no pending vuqs write (for example browser back/forward
or another router integration) identifies only the synchronized paths:

```text
[vuqs] The URL changed outside vuqs; synchronized "color" and "page".
```

When a write selects the resolved default, the summary describes the resulting state
instead of presenting URL cleanup as the user's intent:

```text
[vuqs] "page" now uses its default value (1), so the URL does not need a "page" parameter.
```

If canonicalizing the default leaves the URL unchanged, it produces no summary line.
See the [debug event reference](/api/debug-events#common-summary-results) for the other
committed-write forms.

Use `trace` for the complete FIFO stream:

```ts
enableDebug({ preset: 'trace' })
```

```text
[vuqs trace] gtq:enqueue — Queued 1 URL change; 1 path is now pending. { ... }
```

The searchable event code stays in the trace label. Runtime, binding, transaction, batch,
timestamps and global sequence move into one expandable details object, so the sentence
remains readable. The console does not group asynchronous events heuristically; causal
grouping uses the structured context.

See the [debug event reference](/api/debug-events) for every code, summary policy, trace
message, payload field, and the common aggregated summary results.

## Filtering

The official reporter supports include/exclude selectors. Dimensions within one selector
are combined, while values inside a dimension are alternatives. Exclusion wins:

```ts
enableDebug({
  preset: 'trace',
  filter: {
    include: { scopes: ['gtq', 'adapter'], runtimeIds: ['rt0'] },
    exclude: { codes: ['gtq:schedule'] },
  },
})
```

Filters run before payload normalization and redaction.

## Payload safety

The default `payload: 'preview'` prints a stable, bounded snapshot of the value at event
time. It detaches Vue proxies, cycles and mutable references, and redacts common sensitive
keys such as `password`, `token`, `cookie`, `authorization` and `session`.

Add application-specific redaction at the bridge:

```ts
enableDebug({
  redact(preview) {
    // Return another plain representation.
    return preview
  },
})
```

If redaction throws, vuqs fails closed and prints no raw fallback. The result is normalized
again after the hook. Dynamic names and values in console sentences come from this same
projection; if a redactor removes the expected shape, the reporter uses generic prose
instead of falling back to the raw event.

`payload: 'full'` deliberately prints live raw references and bypasses preview redaction.
`payload: 'hidden'` prints only the event narrative. Neither the built-in denylist nor a
custom hook can guarantee that arbitrary application data contains no secrets, so do not
enable raw production diagnostics casually.

Literal text passed to `createDebugLogger` is controlled by the module author and cannot
be redacted automatically; its structured arguments follow the payload policy.

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
clearing its own marks when the limit is reached. It does not infer durations; future
measures require canonical batch start/end.

## Nuxt

The shorthand enables browser diagnostics only, in development:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { debug: true },
})
```

`'force'` includes the browser reporter in production. Server logging is a separate,
explicit target because query/storage payloads may contain request data:

```ts
vuqs: {
  debug: {
    client: 'force',
    server: true, // development server only
  },
}
```

Use `server: 'force'` only when production server logging is intentional. The server
plugin attaches to that request's adapter channel and disposes after render, error or
redirect. It never falls back to the process-global hub, so runtime-less fallback events
are omitted rather than mixed across concurrent requests. The client reporter is owned by
the Nuxt app and is removed on unmount/HMR.

When the client plugin is included, `vuqs:debug` overrides its default summary for that
browser. Set `console.enabled: false` to disable the installed client reporter locally.
An absent config keeps the Nuxt default summary. Server diagnostics ignore browser
storage and remain controlled only by the Nuxt target.

Do not also import the side-effecting `@vuqs/core/debug` entry in that Nuxt app: it owns
an independent reporter and would render each event twice.

All target decisions happen at build time; debug configuration is not placed in public
runtime config.

## Instrumenting a module

```ts
import { createDebugLogger } from '@vuqs/core'

const log = createDebugLogger('my-module')

log.debug('resolved %O', value)
log.warn('ignoring invalid input %s', raw)
```

These are structured `module:log`/`module:warn` events observed by the console, history
and custom reporters.

## Observing programmatically

```ts
import { addDebugReporter, getDebugChannel } from '@vuqs/core'

const stop = addDebugReporter((event) => {
  // code, scope, level, seq, timestamp, context, data
}, { channel: getDebugChannel(adapter) })
```

A global reporter observes every runtime. For SSR isolation, each request needs a distinct
adapter identity and a reporter scoped to that adapter channel.

Live custom reporters receive raw read-only references. Replayed history receives a
normalized, deeply frozen record, but normalization is not redaction: retained query and
module payloads may still contain application data. A bridge must redact history before
transporting or persisting it. `retainDebugHistory` uses a bounded ring; a zero, negative
or `NaN` limit does not arm the channel. `getDebugSnapshot` returns binding-owned engine
and storage state plus the adapter queue, including committed/optimistic selection and the
current overlay.

Snapshots are bounded and detached, but they are not redacted: engine values/defaults,
storage metadata, and the pending overlay may still contain application data. An official
bridge must apply its redaction policy before transporting or persisting a snapshot.

Malformed URL values produce one binding-attributed `engine:parse-miss` warning when the
engine reads them. Codecs themselves remain pure: calling `codec.parse()` directly never
logs and still degrades invalid input to `undefined`.
