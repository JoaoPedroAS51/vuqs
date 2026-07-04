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
  // parse stays raw (T | undefined); the param resolves the default
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
  read: (query: ParsedQuery) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
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
interface QueryStatesActions<TSchema> { setValues: unknown; clear: unknown }
interface UseQueryStatesReturn<TSchema> extends QueryStatesActions<TSchema> { values: QueryStatesValues<TSchema> }

type ToQueryRefs<T> = { [K in keyof T]: unknown } // one ref per field; QueryStateRef for values, ComputedRef for read-only maps

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

The advanced surface behind [`createQueryStateEngine`](/api/serializer). The engine
is organized into facets, shared with the [`QueryCore`](/modules/authoring#authoring-types)
a module receives.

```ts
interface QueryStateEngineOptions<TSchema> extends NavigateOptions {
  schema: TSchema
  adapter: { query: MaybeRefOrGetter<ParsedQuery>; navigate: QueryStateNavigate }
  throttleMs?: number
  clearOnDefault?: boolean
}

interface QueryStateEngine<TSchema> {
  state: QueryStateReads<TSchema>      // { selected, values }
  defaults: QueryDefaultsBus<TSchema>  // { resolved, register }
  query: {
    current: () => ParsedQuery
    set: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
  }
  options: ResolvedQueryStateOptions
  pipeline: QueryPipelineBus
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

## Module types

Module-specific types live with each module: [`RuntimeDefaultsStatesApi`](/modules/runtime-defaults#api),
[`RuntimeDefaultsStateApi`](/modules/runtime-defaults#api),
[`QueryStatesContextOptions`](/modules/context#options),
[`QueryStateContextOptions`](/modules/context#options), and
[`ContextStatesApi`](/modules/context#api),
[`ContextStateApi`](/modules/context#api), plus the
[authoring types](/modules/authoring#authoring-types) (`defineQueryModule`,
`QueryCore`, `QueryStatesModule`, `QueryStateModule`,
`DefinedQueryModule`, `DefinedQueryStateModule`, `DefinedQueryStatesModule`, the
facade-tagged module types `QueryModuleFacade`/`QueryStatesFacadeModule`/`QueryStateFacadeModule`/`QueryFacadeModule`,
the registry types `QueryModuleRegistry`/`QueryModuleName`,
`QueryHooks`, `QueryPipeline`, and the `@vuqs/core/shared` helpers).
