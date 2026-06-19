# API: types

The exported type surface, grouped by area. Each group's <Badge type="info" text="badge" />
shows the entry point it's imported from.

## Codec types <Badge type="info" text="@vuqs/core" />

```ts
interface Codec<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq: (a: T, b: T) => boolean
  readonly defaultValue?: T
  withDefault: (defaultValue: T) => CodecWithDefault<T>
}

interface CodecWithDefault<T> extends Codec<T> {
  readonly defaultValue: T
  // parse stays a selection (T | undefined); the engine's default layer resolves the default
}

interface CodecInput<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq?: (a: T, b: T) => boolean
}
```

## Param & schema types <Badge type="info" text="@vuqs/core" />

```ts
interface DefinedQueryParam<T> {
  readonly paths: readonly string[]
  read: (query: ParsedQuery) => T | undefined // pure selection: undefined when absent or invalid
  write: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  resolve?: (selection: T, defaults: T | undefined) => T // composite only: composes a present selection over its default
  readonly defaultValue?: T
  readonly clearOnDefault?: boolean
}

interface DefinedQueryParamWithDefault<T> extends DefinedQueryParam<T> {
  readonly defaultValue: T
}

// The chainable builders `queryParam` returns; each is a DefinedQueryParam.
type QueryParamBuilder<T> // .withDefault/.withEquality/.keepOnDefault/.transform
type QueryParamBuilderWithDefault<T>
type QueryParamObjectBuilder<T> // adds .withDefaultsWhenPresent
type QueryParamObjectBuilderWithDefault<T>
type PrefixedQueryParamBuilder<TParam>
interface QueryParamTransform<TInput, TOutput> { read; write; eq? }

type QueryStateSchema = Record<string, DefinedQueryParam<any>>
type QueryStateSchemaInput = Record<string, Codec<any> | DefinedQueryParam<any>>

type QueryStateValueOf<TDefinition> = unknown // the decoded value type of a definition
type QueryStateRefValue<TDefinition> = unknown // T with a default, else T | undefined
type QueryStateValues<TSchema> = Partial<Record<keyof TSchema, unknown>> // every param optional
type QueryStateWriteValues<TSchema> = Partial<Record<keyof TSchema, unknown | null>> // the write protocol
```

`QueryStateWriteValues` is the three-state write map: omit/`undefined` skips,
`null` clears, a value sets. See [null vs undefined](/guide/going-further/null-vs-undefined).

## Composable types <Badge type="info" text="@vuqs/core" />

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}

interface UseQueryStatesOptions extends NavigateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
  throttleMs?: number
  clearOnDefault?: boolean
}

type QueryStatesValues<TSchema> = { [K in keyof TSchema]: unknown } // the reactive values map type
interface QueryStatesActions<TSchema> { patch: unknown; replace: unknown; clear: unknown }
interface UseQueryStatesReturn<TSchema> extends QueryStatesActions<TSchema> { values: QueryStatesValues<TSchema> }

type ToQueryRefs<TSchema> = { [K in keyof TSchema]: unknown } // one QueryStateRef per param
type QueryRef<TSchema> = unknown // a writable ref over the whole value map (snapshot read, replace write)

interface QueryBinding<TSchema> {
  readonly keys: readonly (keyof TSchema & string)[]
  readonly read: ComputedRef<QueryStateValues<TSchema>>
  readonly transact: (request: QueryTransactionRequest<TSchema>) => void
}

interface QueryBindingSource<TSchema> {
  readonly binding: QueryBinding<TSchema>
}

// Module composition; details in /modules/authoring
type QueryComposable<TSchema, TApi> = TApi & {
  use: {
    // facade-tagged factory module (pins the facade); then any grouped module
    <TAdded>(module: QueryStatesFacadeModule<'states', TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
    <TAdded>(module: QueryStatesModule<TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
  }
}
type QueryStatesModule<TSchema, TAdded> = (core: QueryCore<TSchema>) => TAdded
type QueryStateModule<TSchema, TAdded> = (core: QueryCore<TSchema>, key: keyof TSchema & string) => TAdded
type DefinedQueryStatesModule<TSchema, TAdded> = QueryStatesModule<TSchema, TAdded>
interface DefinedQueryStateModule<TAdded> {
  /* single-param projection consumed by useQueryState */
}
type DefinedQueryModule<TSchema, TQueryStatesApi, TQueryStateApi> = QueryStatesModule<TSchema, TQueryStatesApi> & {
  /* single-param projection consumed by useQueryState */
}

// Facade-tagged modules, for factories with per-facade options (see /modules/authoring)
type QueryModuleFacade = 'state' | 'states'
interface QueryStatesFacadeModule<TFacade, TSchema, TApi> extends QueryStatesModule<TSchema, TApi> { /* + facade tag */ }
interface QueryStateFacadeModule<TFacade, TApi> extends DefinedQueryStateModule<TApi> { /* + facade tag */ }
interface QueryFacadeModule<TFacade, TSchema, TStatesApi, TStateApi> { /* adaptive dual + facade tag */ }

type UseQueryStateReturn<T, TApi = object, TValue = T> = QueryStateRef<T> & TApi & {
  use: {
    <TAdded>(module: QueryStateFacadeModule<'state', TAdded>): UseQueryStateReturn<T, TApi & TAdded, TValue>
    <TStateApi>(module: DefinedQueryStateModule<TStateApi>): UseQueryStateReturn<T, TApi & TStateApi, TValue>
  }
}
interface QueryCore<TSchema> { /* the faceted core passed to a module */ }

function defineQueryModule<TSchema, TQueryStatesApi, TQueryStateApi>(definition: {
  queryStates: QueryStatesModule<TSchema, TQueryStatesApi>
  queryState: QueryStateModule<QueryStateSchema, TQueryStateApi>
}): DefinedQueryModule<TSchema, TQueryStatesApi, TQueryStateApi>
function defineQueryModule<TSchema, TQueryStatesApi>(definition: {
  queryStates: QueryStatesModule<TSchema, TQueryStatesApi>
}): DefinedQueryStatesModule<TSchema, TQueryStatesApi>
function defineQueryModule<TQueryStateApi>(definition: {
  queryState: QueryStateModule<QueryStateSchema, TQueryStateApi>
}): DefinedQueryStateModule<TQueryStateApi>
```

`QueryBinding` is the schema-typed root used by `toQueryRef` and `toQueryRefs`.
`useQueryStates` is a `QueryBindingSource`; pass the composable to those helpers
rather than reaching for its internal `.binding` property directly.

## Adapter & navigation types <Badge type="info" text="@vuqs/core" />

```ts
interface QueryAdapter {
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: QueryStateNavigate
  defaultOptions?: QueryAdapterDefaultOptions
}

interface QueryAdapterDefaultOptions extends NavigateOptions {
  throttleMs?: number
  clearOnDefault?: boolean
}

interface NavigateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
}

type QueryStateNavigate = (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>
```

## Query value types <Badge type="info" text="@vuqs/core" />

```ts
type ParsedQueryValue =
  | string | number | boolean | null | undefined
  | ParsedQueryValue[]
  | { [key: string]: ParsedQueryValue }

type ParsedQuery = Record<string, ParsedQueryValue>    // input side (from the URL)
type ParsedQueryRaw = Record<string, ParsedQueryValue> // output side (to the URL)
```

## Serializer types <Badge type="info" text="@vuqs/core" />

```ts
interface CreateSerializerOptions {
  clearOnDefault?: boolean
  stringify?: (query: ParsedQueryRaw) => string
  parse?: (search: string) => ParsedQuery
}

interface Serializer<TSchema, TBase, TOutput> {
  (values: QueryStateWriteValues<TSchema>): TOutput
  (base: TBase, values: QueryStateWriteValues<TSchema>): TOutput
}

type SerializerStringify = (query: ParsedQueryRaw) => string
type SerializerParse = (search: string) => ParsedQuery
```

## Engine types <Badge type="info" text="@vuqs/core" />

[`createQueryStateEngine`](/api/serializer) returns these types. Its facets match
the [`QueryCore`](/modules/authoring#authoring-types) passed to modules.

```ts
interface QueryStateEngineOptions<TSchema> extends NavigateOptions {
  id: string
  schema: TSchema
  adapter: QueryAdapter
  throttleMs?: number
  clearOnDefault?: boolean
  adapterClearOnDefault?: boolean
}

interface QueryStateEngine<TSchema> {
  state: QueryStateReads<TSchema>      // { selected, values }
  defaults: QueryDefaultsBus<TSchema>  // { resolved, register }
  query: {
    current: () => ParsedQuery
    transact: (request: QueryTransactionRequest<TSchema>) => void
    transactions: QueryTransactionBus<TSchema>
  }
  options: ResolvedQueryStateOptions
  pipeline: QueryPipelineBus
}

type QueryTransactionDefaultPolicy = 'binding' | 'preserve-explicit'
type QueryTransactionOrigin = symbol

type QueryTransactionRequest<TSchema> =
  | {
      mode: 'patch'
      values: QueryStateWriteValues<TSchema>
      navigation?: NavigateOptions
      origin?: QueryTransactionOrigin
      defaultPolicy?: QueryTransactionDefaultPolicy
    }
  | {
      mode: 'replace'
      values: QueryStateValues<TSchema>
      navigation?: NavigateOptions
      origin?: QueryTransactionOrigin
      defaultPolicy?: QueryTransactionDefaultPolicy
    }

interface QueryTransaction<TSchema> {
  readonly id: number
  readonly mode: 'patch' | 'replace'
  readonly keys: readonly (keyof TSchema & string)[]
  readonly paths: readonly string[]
  readonly origin?: QueryTransactionOrigin
}

interface QueryTransactionObserver<TSchema> {
  start: (transaction: QueryTransaction<TSchema>) => void
}

interface QueryTransactionBus<TSchema> {
  observe: (observer: QueryTransactionObserver<TSchema>) => () => void
}

interface QueryStateReads<TSchema> {
  selected: ComputedRef<QueryStateValues<TSchema>> // selections, no defaults
  values: ComputedRef<QueryStateValues<TSchema>>   // selection over the resolved defaults
}

interface QueryDefaultsBus<TSchema> {
  resolved: ComputedRef<QueryStateValues<TSchema>> // merged default layers
  register: (source: MaybeRefOrGetter<QueryStateValues<TSchema>>) => () => void
}

interface ResolvedQueryStateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
  throttleMs: number
  clearOnDefault: boolean
}
```

`query.transact` atomically applies a `patch` or `replace`. Patch skips
`undefined`; replace clears absent or `undefined` entries. `defaultPolicy` defaults
to `'binding'`, which applies the binding's `clearOnDefault`; use
`'preserve-explicit'` when replaying an exact explicit selection.

An empty or `undefined`-only patch creates no transaction. An explicitly touched
key does create a transaction start even when its serialized delta is a no-op; this
preserves the write intent for observers and follows normal navigation scheduling.
Request validation and serialization finish before the optimistic overlay changes:
an unknown key or a codec/write-pipeline error throws synchronously without a
partial write or transaction start.

`transactions.observe` synchronously receives immutable start snapshots for writes
from the same adapter whose raw paths overlap the observer schema. `keys` are
projected to that schema, `id` is monotonic within the adapter runtime, and `origin`
identifies a producer's own writes. A throwing observer is logged and
isolated from the producer and other observers. The returned function stops
observation.

## Module types

Module-specific types live with each module: [`RuntimeDefaultsStatesApi`](/modules/runtime-defaults#api),
[`RuntimeDefaultsStateApi`](/modules/runtime-defaults#api),
[`QueryStatesContextOptions`](/modules/context#options),
[`QueryStateContextOptions`](/modules/context#options), and
[`ContextStatesApi`](/modules/context#api),
[`ContextStateApi`](/modules/context#api),
[`ActiveParamsOptions`](/modules/active-params#options),
[`QueryStorage`](/modules/storage#storage-adapter),
[`StoredQuerySnapshot`](/modules/storage#exact-mirror), and
[`StorageControls`](/modules/storage#storage-controls), plus the
[authoring types](/modules/authoring#authoring-types) (`defineQueryModule`,
`QueryCore`, `QueryStatesModule`, `QueryStateModule`,
`DefinedQueryModule`, `DefinedQueryStateModule`, `DefinedQueryStatesModule`, the
facade-tagged module types `QueryModuleFacade`/`QueryStatesFacadeModule`/`QueryStateFacadeModule`/`QueryFacadeModule`,
the registry types `QueryModuleRegistry`/`QueryModuleName`,
`QueryHooks`, `QueryPipeline`, the transaction types
`QueryTransactionRequest`/`QueryTransaction`/`QueryTransactionObserver`/
`QueryTransactionBus`/`QueryTransactionOrigin`/`QueryTransactionDefaultPolicy`,
and the `@vuqs/core/shared` helpers).
