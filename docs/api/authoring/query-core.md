# QueryCore <Badge type="info" text="@vuqs/core" />

The schema, reactive reads, defaults, query writes, pipeline descriptors, signals, and diagnostics supplied to a module setup.

## Usage

```ts
import { defineQueryModule } from '@vuqs/core'
import { computed } from 'vue'

const withPresence = defineQueryModule({
  states: core => ({
    api: {
      present: computed(() => Object.keys(core.state.explicitValues.value)),
    },
  }),
})
```

## Type

```ts
interface QueryCore<TSchema extends QueryStateSchema> {
  readonly schema: Readonly<TSchema>
  state: QueryStateReads<TSchema>
  defaults: { readonly candidates: ComputedRef<QueryStateContributions<TSchema>> }
  readonly options: Readonly<ResolvedQueryStateOptions>
  pipeline: QueryPipelineBus<TSchema>
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
| `schema` | Normalized definitions managed by the binding. Readonly: assigning an entry is a type error and does not change what the binding captured. |
| `state.explicitValues` | Explicit values plus optimistic writes, after the read pipeline; before engine default resolution. |
| `state.values` | Resolved values: explicit values over the composed defaults, after the read pipeline. |
| `defaults.candidates` | Composed default candidates: static defaults under every installed source, with the `defaults` read projection applied. A candidate blocked by a presence gate stays visible here while the resolved read is absent. |
| `options` | Resolved navigation, throttle, and clearing baseline. Readonly. |
| `pipeline` | [`QueryPipelineBus`](/api/authoring/query-pipeline-bus): creates descriptors a setup returns. |
| `hooks` | [`QueryHookBus`](/api/authoring/query-hook-bus). Subscriptions are released with the module. |
| `debug` | Observation channel of this binding's runtime. Pass it as `target` to [`createDebugLogger`](/api/debugging/create-debug-logger). |
| `query.current()` | Current committed query, without pending writes. |
| `query.transact(request)` | Atomic partial or exhaustive query-state write. |
| `query.transactions` | Observes starts from the same adapter whose raw paths overlap the schema. Observers are released with the module. |

## Transactions

`transact` is the only module write primitive. A `patch` preserves omitted params
and clears explicit `undefined`; a `replace` clears absent or `undefined` entries.
Both apply their full key set to the optimistic state before emitting one
transaction start. Its `defaultPolicy` is `'binding'` by default, which applies
`clearOnDefault`.
Use `'preserve-explicit'` only for exact state replay: an explicitly supplied
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
`origin` symbol to `transact` when the module must ignore its own writes. The
observer is released with the module; the returned disposer removes it earlier. A throwing observer is logged and
isolated: it never aborts the producer or the remaining observers.

```ts
const origin = Symbol('my-module')
core.query.transactions.observe({
  start: transaction => {
    if (transaction.origin !== origin) {
      // React to an external write.
    }
  },
})

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

Resolved reads and default candidate types are documented with [createQueryStateEngine](/api/advanced/create-query-state-engine).

## Related guide

[Writing a module](/modules/authoring).
