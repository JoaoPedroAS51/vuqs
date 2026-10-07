# QueryCore <Badge type="info" text="@vuqs/core" />

The schema, reactive reads, defaults, query writes, pipelines, signals, and diagnostics supplied to a module projection.

## Usage

```ts
import { defineQueryModule } from '@vuqs/core'
import { computed } from 'vue'

const withPresence = defineQueryModule({
  queryStates: core => ({
    present: computed(() => Object.keys(core.state.selected.value)),
  }),
})
```

## Type

```ts
interface QueryCore<TSchema extends QueryStateSchema> {
  schema: TSchema
  state: QueryStateReads<TSchema>
  defaults: QueryDefaultsBus<TSchema>
  options: ResolvedQueryStateOptions
  pipeline: QueryPipelineBus
  hooks: QueryHookBus
  debug: DebugChannelHandle
  query: {
    current: () => ParsedQuery
    transact: (request: QueryTransactionRequest<TSchema>) => void
    transactions: QueryTransactionBus<TSchema>
  }
}
```

## Properties

| Property | Contract |
| --- | --- |
| `schema` | Normalized definitions managed by the binding. |
| `state.selected` | Explicit selections plus optimistic writes, after the read pipeline; no defaults. |
| `state.values` | Resolved selection layered over defaults, after the read pipeline. |
| `defaults.resolved` | Merged codec and registered default layers, after the read pipeline. |
| `defaults.register(source)` | Registers a reactive default layer and returns its disposer. Later layers win; `undefined` does not shadow lower layers. |
| `options` | Resolved navigation, throttle, and clearing baseline. |
| `pipeline` | [`QueryPipelineBus`](/api/authoring/query-pipeline-bus). |
| `hooks` | [`QueryHookBus`](/api/authoring/query-hook-bus). |
| `debug` | Adapter runtime observation channel. |
| `query.current()` | Current committed query, without pending writes. |
| `query.transact(request)` | Atomic partial or exhaustive query-state write. |
| `query.transactions` | Observes starts from the same adapter whose raw paths overlap the schema. |

## Transactions

`transact` is the only module write primitive. A `patch` preserves omitted params
and clears explicit `undefined`; a `replace` clears absent or `undefined` entries.
Both apply their full key set to the optimistic state before emitting one
transaction start. Its `defaultPolicy` is `'binding'` by default, which applies
`clearOnDefault`.
Use `'preserve-explicit'` only for exact selection replay: an explicitly supplied
value remains present even when it equals the resolved default. Codecs, the write
pipeline, replacement clears, navigation, and transaction observation still apply.

An empty patch creates no transaction. An explicitly touched
key emits a start even when it serializes to a no-op, because observers consume the
write intent rather than only URL differences; it still follows normal navigation
scheduling. The complete request is validated and serialized before the optimistic
overlay changes, so an unknown key or a codec/write-pipeline error throws
synchronously without a partial write or start.

`transactions.observe({ start })` receives starts from the same adapter when raw
query paths overlap the module schema. The snapshot is frozen and projected to
the observer's local `keys`. Starts run synchronously in causal transaction id
order, including writes triggered by synchronous reactive watchers. Pass an
`origin` symbol to `transact` when the module must ignore its own writes. Register
the returned disposer with `onScopeDispose`. A throwing observer is logged and
isolated: it never aborts the producer or the remaining observers.

```ts
const origin = Symbol('my-module')
const stop = core.query.transactions.observe({
  start: transaction => {
    if (transaction.origin !== origin) {
      // React to an external write.
    }
  },
})

onScopeDispose(stop)

core.query.transact({
  mode: 'patch',
  values: { page: 1 },
  origin,
})
```

## QueryTransactionRequest

```ts
type QueryTransactionRequest<TSchema extends QueryStateSchema>
  = | (QueryTransactionBase & {
    mode: 'patch'
    values: QueryStateWriteValues<TSchema>
  })
  | (QueryTransactionBase & {
    mode: 'replace'
    values: QueryStateValues<TSchema>
  })
```

## QueryTransaction

```ts
interface QueryTransaction<TSchema extends QueryStateSchema> {
  readonly id: number
  readonly mode: QueryTransactionRequest<TSchema>['mode']
  readonly keys: readonly (keyof TSchema & string)[]
  readonly paths: readonly string[]
  readonly origin?: QueryTransactionOrigin
}
```

## QueryTransactionBus

```ts
interface QueryTransactionBus<TSchema extends QueryStateSchema> {
  observe: (observer: QueryTransactionObserver<TSchema>) => () => void
}
```

## QueryTransactionObserver

```ts
interface QueryTransactionObserver<TSchema extends QueryStateSchema> {
  start: (transaction: QueryTransaction<TSchema>) => void
}
```

## QueryTransactionDefaultPolicy

```ts
type QueryTransactionDefaultPolicy = 'binding' | 'preserve-explicit'
```

## QueryTransactionOrigin

```ts
type QueryTransactionOrigin = symbol
```

Resolved reads and default layer types are documented with [createQueryStateEngine](/api/advanced/create-query-state-engine).

## Related guide

[Writing a module](/modules/authoring).
