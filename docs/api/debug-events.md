<script setup lang="ts">
import DebugEventReference from '../.vitepress/components/DebugEventReference.vue'
</script>

# Debug event reference

Diagnostic notifications emitted by vuqs. Reporters observe these events; they do not control or cancel the operation that produced them.

::: warning Experimental protocol
Event codes and payloads are governed by `DEBUG_PROTOCOL_VERSION`, outside normal semver. The typed map is exported from `@vuqs/core/debug-protocol`.
:::

```ts
import { addDebugReporter } from '@vuqs/core'

const stop = addDebugReporter((event) => {
  console.log(event.code, event.data)
})
```

For activation, filtering, console output, and SSR isolation, see the [debugging guide](/guide/debugging/enabling).

## Events

Expand a payload to see its property types and meanings. A `?` marks an optional property. Events without payloads carry `undefined`.

## Bindings

<DebugEventReference :scopes="['binding']" />

## Transactions and navigation

<DebugEventReference :scopes="['tx', 'gtq', 'adapter']" />

A managed `adapter:commit` is emitted after successful navigation, before queue settlement. Its `source` distinguishes managed writes from external query changes. A testing adapter without memory does not emit a managed commit when simulation leaves its query unchanged.

## Parsing and defaults

<DebugEventReference :scopes="['engine']" />

## Module coordination

<DebugEventReference :scopes="['hooks', 'pipeline']" />

## Runtime defaults

<DebugEventReference :scopes="['rd']" />

## Context

<DebugEventReference :scopes="['ctx']" />

## Storage

<DebugEventReference :scopes="['storage']" />

## Serialization

<DebugEventReference :scopes="['serializer']" />

## Custom module logs

<DebugEventReference :scopes="['module']" />

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

## DebugEmissionContext

```ts
type DebugEmissionContext = Omit<DebugContext, 'runtimeId'>
```

The context supplied by an emitter. The channel supplies `runtimeId`. This type is exported from `@vuqs/core`.

## Correlation

`seq` orders events across the global debug stream. Context identifiers relate events to an adapter runtime, binding, transaction, or navigation batch. Context fields are optional because not every event belongs to each of those operations.

A `batchId` identifies one write window, and every queue event in that window shares it. `gtq:enqueue` lists its own transaction. `gtq:flush`, `adapter:navigate`, `adapter:commit` and `gtq:settle` list every observed transaction in the batch in ascending order.

- A navigation keeps the context captured when it flushed. Its `gtq:settle` carries that context even when observation detaches and resumes before the navigation completes. A later batch on the same path does not inherit it.
- A `gtq:settle` caused by an external query change carries the open batch's context, when one exists. `transactionIds` lists every transaction in that batch, not the writers of each settled path.
- A `gtq:settle` lists every path it removes, including paths written while no reporter was attached.
- Writes made without an attached reporter are recorded in no batch, and attaching later does not recover their transaction ids. The flush of such a write that is still queued when a reporter attaches has a `batchId` without `transactionIds`. The settlement of a navigation invoked before a reporter attached has neither.

For operation sequences and their console results, see [Write lifecycle](/guide/debugging/write-lifecycle).

Summary policies and console examples are documented in [Summary and trace](/guide/debugging/console-output#summary-and-trace).
