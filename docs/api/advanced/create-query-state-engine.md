# createQueryStateEngine <Badge type="info" text="@vuqs/core" />

The reactive engine behind `useQueryState` and `useQueryStates`: atomic
transactions, the adapter-scoped optimistic overlay, reconciliation, write
coalescing, and navigation.

## Usage

```ts
import { codecs, createQueryStateEngine, defineQuerySchema } from '@vuqs/core'
import { createTestingAdapter } from '@vuqs/core/adapters/testing'
import { effectScope } from 'vue'

const scope = effectScope()
const engine = scope.run(() => createQueryStateEngine({
  id: 'search',
  schema: defineQuerySchema({ q: codecs.string }),
  adapter: createTestingAdapter(),
  clearOnDefault: true,
}))

scope.stop()
```

## Type

```ts
function createQueryStateEngine<TSchema extends QueryStateSchema>(options: QueryStateEngineOptions<TSchema>): QueryStateEngine<TSchema>
```

## Parameters

- `options: QueryStateEngineOptions<TSchema>`
  - The schema, adapter, and resolved navigation, coalescing, and default behavior.
    See [`QueryStateEngineOptions`](/api/advanced/create-query-state-engine#querystateengineoptions).

## Return value

- `engine: QueryStateEngine<TSchema>`
  - The reactive reads, defaults, transaction-based query I/O, resolved options,
    pipeline, and debug channel facets a [module](/modules/authoring#the-core) receives.

Bindings using the same adapter share the optimistic overlay, write queue, and
transaction-start registry. The engine is exposed for building higher layers and
must run inside a Vue effect scope. See
[`QueryStateEngineOptions`](/api/advanced/create-query-state-engine#querystateengineoptions).

## QueryStateEngineOptions

```ts
interface QueryStateEngineOptions<TSchema extends QueryStateSchema> extends NavigateOptions {
  id: string
  schema: TSchema
  adapter: QueryAdapter
  throttleMs?: number
  clearOnDefault?: boolean
  adapterClearOnDefault?: boolean
}
```

## QueryStateEngine

```ts
interface QueryStateEngine<TSchema extends QueryStateSchema> {
  state: QueryStateReads<TSchema>
  defaults: QueryDefaultsBus<TSchema>
  query: {
    current: () => ParsedQuery
    transact: (request: QueryTransactionRequest<TSchema>) => void
    transactions: QueryTransactionBus<TSchema>
  }
  options: ResolvedQueryStateOptions
  pipeline: QueryPipelineBus
  debug: DebugChannelHandle
}
```

## QueryStateReads

```ts
interface QueryStateReads<TSchema extends QueryStateSchema> {
  selected: ComputedRef<QueryStateValues<TSchema>>
  values: ComputedRef<QueryStateValues<TSchema>>
}
```

## QueryDefaultsBus

```ts
interface QueryDefaultsBus<TSchema extends QueryStateSchema> {
  resolved: ComputedRef<QueryStateValues<TSchema>>
  register: (source: MaybeRefOrGetter<QueryStateValues<TSchema>>) => () => void
}
```

## ResolvedQueryStateOptions

```ts
interface ResolvedQueryStateOptions {
  history?: NavigateOptions['history']
  scroll?: NavigateOptions['scroll']
  throttleMs: number
  clearOnDefault: boolean
}
```

## Related guide

[Module authoring](/modules/authoring).
