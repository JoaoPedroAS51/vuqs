<script setup lang="ts">
import DebugEventReference from '../.vitepress/components/DebugEventReference.vue'
</script>

# Debug event reference

The structured debug bus exposes a typed event set for console diagnostics, custom
reporters, retained history, and first-party tooling. The protocol is type-only under
`@vuqs/core/debug-protocol` and is governed by `DEBUG_PROTOCOL_VERSION` rather than the
package's normal semver.

::: warning Experimental protocol
Event codes and payloads may change when `DEBUG_PROTOCOL_VERSION` changes. Console prose
is a human-facing projection and may improve without changing the protocol version.
:::

For activation, filtering, payload safety, SSR isolation, and reporter examples, start
with the [debugging guide](/guide/going-further/debugging).

## Event shape <Badge type="info" text="@vuqs/core" />

Every reporter receives the same frozen envelope. `DebugEvent`, `DebugContext`,
and `DebugLevel` are exported from `@vuqs/core`:

```ts
interface DebugContext {
  readonly runtimeId?: string
  readonly bindingId?: string
  readonly transactionIds?: readonly number[]
  readonly batchId?: number
}

interface DebugEvent {
  readonly code: string
  readonly scope: string
  readonly level: DebugLevel
  readonly seq: number
  readonly timestamp: number
  readonly monotonicTime?: number
  readonly context?: DebugContext
  readonly data: unknown
}
```

**Properties**

| Property | Type | Description |
| --- | --- | --- |
| `code` | `string` | The event code. |
| `scope` | `string` | The event's scope. |
| `level` | `'debug' \| 'warn'` | The diagnostic level. |
| `seq` | `number` | The global monotonic event sequence. |
| `timestamp` | `number` | Epoch milliseconds from `Date.now()`. |
| `monotonicTime` | `number` | Optional high-resolution time from `performance.now()`. |
| `context` | `DebugContext` | Optional runtime, binding, transaction and batch identifiers. |
| `data` | `unknown` | The payload for the event code. |

The strict `KnownDebugEvent` union narrows `data` from `code`. Import it and the complete
`DebugEventMap` from `@vuqs/core/debug-protocol` when building protocol-aware tooling.

## Summary policies

- **Visible:** produces its own human summary.
- **Conditional:** produces a summary only for the configured outcomes.
- **Aggregated:** contributes to another logical result, such as a committed URL write.
- **Trace only:** stays out of the default summary but appears in the complete trace.
- **Pass-through:** preserves prose and console arguments supplied by `createDebugLogger`.

A normal write correlates several events but produces one summary result:

```text
tx:start → binding:set → gtq:enqueue → gtq:flush
         → adapter:navigate → adapter:commit → gtq:settle

[vuqs] Updated the URL: "color" = "green".
```

The trace keeps every intermediate event. Its expandable details carry sequence,
timestamps, runtime, binding, transaction, batch, scope, and the event's typed payload.

A managed `adapter:commit` is emitted after navigation completes successfully,
including when its parsed representation differs from the serialized write. It
precedes settlement and carries the attempted paths and batch context.

While a navigation is pending, the queue keeps at most one query observation for
attribution. A later observation reports the previous one as external. The attempt's
outcome attributes the final observation: a successful navigation reports the
managed commit; a rejected attempt reports it as external.

Without memory, the testing adapter settles completed writes into simulated read
state. Its queue snapshot contains only pending writes, and it does not emit a
managed `adapter:commit` for a simulation that leaves the query unchanged.

## Common summary results

Summary prose describes the observable result of a correlated operation. It does not
mirror each low-level event. These are the common committed-write forms:

```text
[vuqs] Updated the URL: "color" = "green".
[vuqs] Removed "draft" from the URL.
[vuqs] Updated 2 URL parameters in one navigation: updated "q" and removed "page".
[vuqs] Updated the URL and added a browser history entry: "page" = 2.
[vuqs] "page" now uses its default value (1), so the URL does not need a "page" parameter.
```

The default-valued form reports the effective query state. It does not imply that the
caller explicitly requested a removal. Default canonicalization that leaves the URL
unchanged produces no summary line.

## Events

The compact index is followed by the full reference grouped by scope. Each entry explains
its summary behavior and, when it prints directly, shows an example from the tested
console projection. Trace examples use the same formatter as the runtime; dynamic names
and counts depend on each payload.

<DebugEventReference />
