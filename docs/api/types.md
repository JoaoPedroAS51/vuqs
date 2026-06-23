# API: types

The exported type surface, grouped by area. All are `import type` from `vuqs`
unless noted.

## Codec types

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

## Field & schema types

```ts
interface QueryStateDefinition<T> {
  readonly paths: readonly string[]
  parse: (query: ParsedQuery) => T | undefined
  serialize: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  readonly defaultValue?: T
}

interface QueryStateDefinitionWithDefault<T> extends QueryStateDefinition<T> {
  readonly defaultValue: T
}

interface QueryStateDefinitionInput<T> {
  paths: readonly string[]
  parse: (query: ParsedQuery) => T | undefined
  serialize: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean
  default?: T
}

type QueryStateSchema = Record<string, QueryStateDefinition<any>>

type QueryStateValueOf<TDefinition> // the decoded value type of a definition
type QueryStateRefValue<TDefinition> // T with a default, else T | undefined
type QueryStateValues<TSchema>       // { [K]?: value } — every field optional
type QueryStateWriteValues<TSchema>  // { [K]?: value | null } — the write protocol
```

`QueryStateWriteValues` is the three-state write map: omit/`undefined` skips,
`null` clears, a value sets. See [null vs undefined](/guide/null-vs-undefined).

## Composable types

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}

interface UseQueryStatesOptions extends NavigateOptions {
  query?: MaybeRefOrGetter<ParsedQuery>
  navigate?: QueryStateNavigate
  throttleMs?: number
  clearOnDefault?: boolean
}

type QueryStatesValues<TSchema>  // the reactive values map type
interface QueryStatesActions<TSchema> { setValues; clear }
interface UseQueryStatesReturn<TSchema> extends QueryStatesActions<TSchema> { values }
```

## Adapter & navigation types

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

## Query value types

```ts
type ParsedQueryValue =
  | string | number | boolean | null | undefined
  | ParsedQueryValue[]
  | { [key: string]: ParsedQueryValue }

type ParsedQuery = Record<string, ParsedQueryValue>    // input side (from the URL)
type ParsedQueryRaw = Record<string, ParsedQueryValue> // output side (to the URL)
```

## Serializer types

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

## Engine types

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

## Store types

`import type { … } from '@vuqs/store'`

```ts
interface CreateQueryStoreOptions<TSchema, TContext> { /* see API: store */ }
interface QueryStoreContext<TSchema, TContext> { active; preserve?; only? }
interface QueryStore<TSchema, TContext> { /* states + writers */ }
type QueryStoreKey<TSchema, TContext> = InjectionKey<QueryStore<TSchema, TContext>>
```

See [API: @vuqs/store](/api/store) for the full shapes.
