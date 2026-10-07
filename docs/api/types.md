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
  nullable: () => Codec<T | null>
}

interface CodecWithDefault<T> extends Codec<T> {
  readonly defaultValue: T
  nullable: () => CodecWithDefault<T | null>
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
interface QueryParamReadContext {
  onInvalid: (path: string, raw: unknown) => void
}

interface DefinedQueryParam<T> {
  readonly paths: readonly string[]
  read: (query: ParsedQuery, context?: QueryParamReadContext) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  resolve?: (selection: T, defaults: T | undefined) => T
  readonly defaultValue?: T
  readonly clearOnDefault?: boolean
  readonly presenceGated?: boolean
}

interface DefinedQueryParamWithDefault<T> extends DefinedQueryParam<T> {
  readonly defaultValue: T
}

interface QueryParamTransform<TInput, TOutput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TInput
  eq?: (a: TOutput, b: TOutput) => boolean
}

interface QueryParamBuilder<T, TDefaultInput = T> extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

interface QueryParamBuilderWithDefault<T, TDefaultInput = T>
  extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilderWithDefault<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

interface QueryParamObjectBuilder<T, TDefaultInput = (T extends object ? Partial<T> : T)>
  extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamObjectBuilder<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamObjectBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

interface QueryParamObjectBuilderWithDefault<
  T,
  TDefaultInput = (T extends object ? Partial<T> : T),
  THasOwnDefault extends boolean = true,
> extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput, true>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilderWithDefault<T, TDefaultInput, THasOwnDefault>
  keepOnDefault: () => QueryParamObjectBuilderWithDefault<T, TDefaultInput, THasOwnDefault>
  withDefaultsWhenPresent: () => THasOwnDefault extends true
    ? QueryParamObjectBuilderWithDefault<T, TDefaultInput, true>
    : QueryParamObjectBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

type PrefixedQueryParamBuilder<TParam extends DefinedQueryParam<any>>
  = TParam extends QueryParamObjectBuilderWithDefault<infer TValue, infer TDefaultInput, infer THasOwnDefault extends boolean>
    ? QueryParamObjectBuilderWithDefault<TValue, TDefaultInput, THasOwnDefault>
    : TParam extends QueryParamObjectBuilder<infer TValue, infer TDefaultInput>
      ? QueryParamObjectBuilder<TValue, TDefaultInput>
      : TParam extends QueryParamBuilderWithDefault<infer TValue, infer TDefaultInput>
        ? QueryParamBuilderWithDefault<TValue, TDefaultInput>
        : TParam extends QueryParamBuilder<infer TValue, infer TDefaultInput>
          ? QueryParamBuilder<TValue, TDefaultInput>
          : TParam extends DefinedQueryParamWithDefault<infer TValue>
            ? QueryParamBuilderWithDefault<TValue>
            : QueryParamBuilder<QueryStateValueOf<TParam>>

type QueryStateSchema = Record<string, DefinedQueryParam<any>>

type QueryStateSchemaInput = Record<string, Codec<any> | DefinedQueryParam<any>>

type NormalizeQueryStateSchema<TSchema extends QueryStateSchemaInput> = {
  [Key in keyof TSchema]: TSchema[Key] extends DefinedQueryParam<any>
    ? TSchema[Key]
    : TSchema[Key] extends Codec<infer TValue>
      ? TSchema[Key] extends { readonly defaultValue: infer TDefault }
        ? DefinedQueryParamWithDefault<TDefault>
        : DefinedQueryParam<TValue>
      : never
}

type QueryStateValueOf<TDefinition>
  = TDefinition extends DefinedQueryParam<infer TValue> ? TValue : never

type QueryStateValueAt<TSchema extends QueryStateSchema, TKey extends string>
  = TSchema extends { [Key in TKey]: infer TDefinition }
    ? QueryStateValueOf<TDefinition>
    : never

type QueryStateRefValue<TDefinition extends DefinedQueryParam<any>>
  = TDefinition extends DefinedQueryParamWithDefault<any>
    ? QueryStateValueOf<TDefinition>
    : QueryStateValueOf<TDefinition> | undefined

type QueryStateValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]> | undefined
}

type QueryStateWriteValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]> | undefined
}
```

`QueryParamReadContext` describes the optional internal diagnostic argument to
`read`; it is not exported from `@vuqs/core`.

`QueryStateWriteValues` is the partial-write value map. With `patch` and the
serializer, omitted params are preserved and explicit `undefined` clears.
`QueryStateValues` has the same optional value shape; `replace` and `toQueryRef`
use whole-state writes, so omitted params clear.

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

type QueryStatesValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRefValue<TSchema[Key]>
}
interface QueryStatesActions<TSchema extends QueryStateSchema> {
  patch: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  replace: (values: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
interface UseQueryStatesReturn<TSchema extends QueryStateSchema>
  extends QueryStatesActions<TSchema>, QueryBindingSource<TSchema> {
  values: QueryStatesValues<TSchema>
}

type ToQueryRefs<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRef<QueryStateRefValue<TSchema[Key]>>
}
interface QueryRef<TSchema extends QueryStateSchema>
  extends WritableComputedRef<QueryStateValues<TSchema>> {
  set: (value: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}

interface QueryBinding<TSchema extends QueryStateSchema> {
  readonly keys: readonly (keyof TSchema & string)[]
  readonly read: ComputedRef<QueryStateValues<TSchema>>
  readonly transact: (request: QueryTransactionRequest<TSchema>) => void
}

interface QueryBindingSource<TSchema extends QueryStateSchema> {
  readonly binding: QueryBinding<TSchema>
}

declare const QUERY_STATE_MODULE: unique symbol
declare const QUERY_MODULE_KIND: unique symbol
declare const QUERY_MODULE_NAME: unique symbol

type QueryStatesModule<TSchema extends QueryStateSchema, TApi> = (core: QueryCore<TSchema>) => TApi

type QueryStateModule<TSchema extends QueryStateSchema, TApi> = (
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
) => TApi

type AnyQueryStateModule<TApi> = <
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(
  core: QueryCore<TSchema>,
  key: TKey,
) => TApi

type DefinedQueryStatesModule<TSchema extends QueryStateSchema, TApi> = QueryStatesModule<TSchema, TApi>

interface DefinedQueryStateModule<TApi> {
  readonly [QUERY_STATE_MODULE]: AnyQueryStateModule<TApi>
}

type DefinedQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TQueryStateApi,
> = DefinedQueryStatesModule<TSchema, TQueryStatesApi> & DefinedQueryStateModule<TQueryStateApi>

type QueryModuleFacade = 'state' | 'states'

interface QueryStatesFacadeModule<
  TFacade extends QueryModuleFacade,
  TSchema extends QueryStateSchema,
  TApi,
> extends QueryStatesModule<TSchema, TApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

interface QueryStateFacadeModule<TFacade extends QueryModuleFacade, TApi>
  extends DefinedQueryStateModule<TApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

interface QueryFacadeModule<TFacade, TSchema extends QueryStateSchema, TStatesApi, TStateApi>
  extends QueryStatesModule<TSchema, TStatesApi>, DefinedQueryStateModule<TStateApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

interface QueryStateNameModule<TName extends QueryModuleName>
  extends DefinedQueryStateModule<QueryModuleStateApi<TName, QueryStateSchema, string>> {
  readonly [QUERY_MODULE_KIND]: 'state'
  readonly [QUERY_MODULE_NAME]: TName
}

type QueryStateNameApiOf<
  TModule,
  TSchema extends QueryStateSchema,
> = TModule extends { readonly [QUERY_MODULE_NAME]: infer TName extends QueryModuleName }
  ? QueryModuleStateApi<TName, TSchema, string>
  : never

interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {}

type QueryModuleName = keyof QueryModuleRegistry<QueryStateSchema, string>

type QueryModuleStateApi<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { state: { api: infer TApi } } ? TApi : object

interface SingleQueryStateSchema<T> extends QueryStateSchema {
  value: DefinedQueryParam<T>
}

type QueryComposable<TSchema extends QueryStateSchema, TApi> = TApi & {
  use: {
    <TAdded>(module: QueryStatesFacadeModule<'states', TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
    <TAdded>(module: QueryStatesModule<TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
  }
}

type UseQueryStateReturn<T, TApi = object, TValue = T> = QueryStateRef<T> & TApi & {
  use: {
    <TStateApi>(
      module: QueryFacadeModule<'state', SingleQueryStateSchema<TValue>, any, TStateApi>,
    ): UseQueryStateReturn<T, TApi & TStateApi, TValue>
    <TModule extends QueryStateNameModule<any>>(
      module: TModule,
    ): UseQueryStateReturn<T, TApi & QueryStateNameApiOf<TModule, SingleQueryStateSchema<TValue>>, TValue>
    <TAdded>(
      module: QueryStateFacadeModule<'state', TAdded>,
    ): UseQueryStateReturn<T, TApi & TAdded, TValue>
    <TAdded>(
      module: DefinedQueryStateModule<TAdded>,
    ): UseQueryStateReturn<T, TApi & TAdded, TValue>
  }
}
```

The three symbol markers, `AnyQueryStateModule`, `QueryStateNameModule`,
`QueryStateNameApiOf`, `QueryModuleStateApi`, and `SingleQueryStateSchema` above
are supporting declarations, not exports from `@vuqs/core`. Factories produced by
[`defineQueryModule`](/modules/authoring#defining-a-module) construct the module
values; callers do not create or access their markers.

`QueryBinding` is the schema-typed root used by `toQueryRef` and `toQueryRefs`.
`useQueryStates` is a `QueryBindingSource`; pass the composable to those helpers
rather than reaching for its internal `.binding` property directly.

## Adapter & navigation types <Badge type="info" text="@vuqs/core" />

```ts
interface QueryAdapter {
  debugName?: string
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

interface Serializer<TSchema extends QueryStateSchema, TBase, TOutput> {
  (values: QueryStateWriteValues<TSchema>): TOutput
  (base: TBase, values: QueryStateWriteValues<TSchema>): TOutput
}

type SerializerStringify = (query: ParsedQueryRaw) => string
type SerializerParse = (search: string) => ParsedQuery
```

## Engine types <Badge type="info" text="@vuqs/core" />

[`createQueryStateEngine`](/api/serializer#createquerystateengine) returns these types. Its facets match
the [`QueryCore`](/modules/authoring#authoring-types) passed to modules.

```ts
interface QueryStateEngineOptions<TSchema extends QueryStateSchema> extends NavigateOptions {
  id: string
  schema: TSchema
  adapter: QueryAdapter
  throttleMs?: number
  clearOnDefault?: boolean
  adapterClearOnDefault?: boolean
}

interface QueryStateEngine<TSchema extends QueryStateSchema> {
  state: QueryStateReads<TSchema>      // { selected, values }
  defaults: QueryDefaultsBus<TSchema>  // { resolved, register }
  query: {
    current: () => ParsedQuery
    transact: (request: QueryTransactionRequest<TSchema>) => void
    transactions: QueryTransactionBus<TSchema>
  }
  options: ResolvedQueryStateOptions
  pipeline: QueryPipelineBus
  debug: DebugChannelHandle
}

type QueryTransactionDefaultPolicy = 'binding' | 'preserve-explicit'
type QueryTransactionOrigin = symbol

type QueryTransactionRequest<TSchema extends QueryStateSchema> =
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

interface QueryTransaction<TSchema extends QueryStateSchema> {
  readonly id: number
  readonly mode: 'patch' | 'replace'
  readonly keys: readonly (keyof TSchema & string)[]
  readonly paths: readonly string[]
  readonly origin?: QueryTransactionOrigin
}

interface QueryTransactionObserver<TSchema extends QueryStateSchema> {
  start: (transaction: QueryTransaction<TSchema>) => void
}

interface QueryTransactionBus<TSchema extends QueryStateSchema> {
  observe: (observer: QueryTransactionObserver<TSchema>) => () => void
}

interface QueryStateReads<TSchema extends QueryStateSchema> {
  selected: ComputedRef<QueryStateValues<TSchema>> // selections, no defaults
  values: ComputedRef<QueryStateValues<TSchema>>   // selection over the resolved defaults
}

interface QueryDefaultsBus<TSchema extends QueryStateSchema> {
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

`query.transact` atomically applies a `patch` or `replace`. Patch preserves omitted
params and clears explicit `undefined`; replace clears absent or `undefined`
entries. `defaultPolicy` defaults to `'binding'`, which applies the binding's
`clearOnDefault`; use
`'preserve-explicit'` when replaying an exact explicit selection.

An empty patch creates no transaction. An explicitly touched
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
