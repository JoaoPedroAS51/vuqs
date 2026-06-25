# API: types

The exported type surface, grouped by area. Each group's <Badge type="info" text="badge" />
shows the entry point it's imported from.

## Codec types <Badge type="info" text="vuqs" />

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
  parse: (raw: ParsedQueryValue) => T // never undefined
}

interface CodecInput<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq?: (a: T, b: T) => boolean
}
```

## Param & schema types <Badge type="info" text="vuqs" />

```ts
interface QueryParamDefinition<T> {
  readonly paths: readonly string[]
  parse: (query: ParsedQuery) => T | undefined
  serialize: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  readonly defaultValue?: T
}

interface QueryParamDefinitionWithDefault<T> extends QueryParamDefinition<T> {
  readonly defaultValue: T
}

interface QueryParamDefinitionInput<T> {
  paths: readonly string[]
  parse: (query: ParsedQuery) => T | undefined
  serialize: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean
  default?: T
}

type QueryStateSchema = Record<string, QueryParamDefinition<any>>

type QueryStateValueOf<TDefinition> // the decoded value type of a definition
type QueryStateRefValue<TDefinition> // T with a default, else T | undefined
type QueryStateValues<TSchema>       // { [K]?: value } — every param optional
type QueryStateWriteValues<TSchema>  // { [K]?: value | null } — the write protocol
```

`QueryStateWriteValues` is the three-state write map: omit/`undefined` skips,
`null` clears, a value sets. See [null vs undefined](/guide/null-vs-undefined).

## Composable types <Badge type="info" text="vuqs" />

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

type QueryStatesValues<TSchema>  // the reactive values map type
interface QueryStatesActions<TSchema> { setValues; clear }
interface UseQueryStatesReturn<TSchema> extends QueryStatesActions<TSchema> { values }

// Module composition (see Modules)
type QueryComposable<TSchema, TApi> = TApi & {
  use: <TAdded>(module: QueryModule<TSchema, TAdded>) => QueryComposable<TSchema, TApi & TAdded>
}
type QueryModule<TSchema, TAdded> = (core: QueryCore<TSchema>) => TAdded
interface QueryCore<TSchema> { /* the shared core passed to a module */ }
```

## Adapter & navigation types <Badge type="info" text="vuqs" />

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

## Query value types <Badge type="info" text="vuqs" />

```ts
type ParsedQueryValue =
  | string | number | boolean | null | undefined
  | ParsedQueryValue[]
  | { [key: string]: ParsedQueryValue }

type ParsedQuery = Record<string, ParsedQueryValue>    // input side (from the URL)
type ParsedQueryRaw = Record<string, ParsedQueryValue> // output side (to the URL)
```

## Serializer types <Badge type="info" text="vuqs" />

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

## Engine types <Badge type="info" text="vuqs" />

```ts
interface QueryStateEngineOptions<TSchema> extends NavigateOptions {
  schema: TSchema
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: QueryStateNavigate
  parse: (query: ParsedQuery) => QueryStateValues<TSchema>
  build: (currentQuery: ParsedQuery, values: QueryStateValues<TSchema>) => ParsedQueryRaw
  throttleMs?: number
  clearOnDefault?: boolean
}

interface QueryStateEngine<TSchema> {
  values: ComputedRef<QueryStateValues<TSchema>>
  setValue: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
}
```

## Module types <Badge type="tip" text="vuqs/modules" />

```ts
interface EffectiveApi<TSchema> { selected; defaults; effective; setDefaults; clearDefaults }
interface ContextOptions<TSchema, TContext> { active; preserve?; only?; navigate? }
interface ContextApi<TContext> { activeContext; buildContextQuery; switchTo }
```

## Module authoring types <Badge type="info" text="vuqs" />

```ts
interface QueryCore<TSchema> { schema; selected; setValue; navigate; currentQuery; hooks; pipeline; clearOnDefault }
type QueryModule<TSchema, TAdded> = (core: QueryCore<TSchema>) => TAdded

interface QueryHooks {} // augment via `declare module 'vuqs'`
interface QueryHookBus { on; emit }

interface QueryPipeline { read; write; navigate }
type QueryPipelineStage = keyof QueryPipeline
type Enforce = 'pre' | 'default' | 'post'
interface QueryPipelineBus { tap; run }
type QueryValues = Record<string, unknown>
```

See [API: modules](/api/modules#authoring) for the full shapes.
