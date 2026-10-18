# queryParam <Badge type="info" text="@vuqs/core" />

Builds a reusable [param](/guide/query-state/defining-params). Returns a chainable
**builder** that is itself a param and can be passed to a schema, `useQueryState`,
or the serializer.

## Usage

```ts
import { codecs, queryParam } from '@vuqs/core'

const sort = queryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc'))
```

## Type

```ts
function queryParam(path: string): QueryParamBuilder<string>
function queryParam(path: string, options: { defaultValue: string }): QueryParamBuilderWithDefault<string>
function queryParam<T>(path: string, codec: CodecWithDefault<T>): QueryParamBuilderWithDefault<T>
function queryParam<T>(path: string, codec: Codec<T>): QueryParamBuilder<T>
```

## Parameters

- `path: string`
  - The query key the param owns.
- `codec?: Codec<T>`
  - The codec bound to `path`. With none, the param is a plain string;
    `{ defaultValue }` is shorthand for a string with a default. A `CodecWithDefault`
    produces a defaulted param.
- `options: { defaultValue: string }`
  - The string default, passed in place of a codec.

## Return value

- `builder: QueryParamBuilder<T>` (or `QueryParamBuilderWithDefault<T>` when defaulted)
  - A `DefinedQueryParam<T>` with chainable modifiers, each returning a new builder:
    - `.withDefault(v)`: sets the param's default.
    - `.withEquality(eq)`: sets how values compare (drives `clearOnDefault`).
    - `.keepOnDefault()`: keeps a default-valued write in the URL.
    - `.transform({ read, write, eq? })`: maps the param to a different public shape.

For composite params and prefixed definitions, use [queryParam.object](/api/params/query-param-object).

## DefinedQueryParam

```ts
interface DefinedQueryParam<
  TExplicit,
  TResolved = TExplicit,
  TContribution = TExplicit,
  TGuaranteed extends boolean = boolean,
> {
  readonly [paramContract]?: ParamContract<TExplicit, TResolved, TContribution, TGuaranteed>
  readonly paths: readonly string[]
  read: (query: ParsedQuery, context?: QueryParamReadContext) => TExplicit | undefined
  write: (value: TExplicit) => ParsedQueryRaw
  eq: (a: TExplicit, b: TExplicit) => boolean
  resolve?: (
    explicitValue: TExplicit | undefined,
    defaultValue: TResolved | undefined,
  ) => [TGuaranteed] extends [true] ? TResolved : TResolved | undefined
  readonly defaultValue?: TContribution
  readonly clearOnDefault?: boolean
  readonly presenceGated?: boolean
}
```

`TExplicit` is the decoded value before default resolution and the value writers accept. `TResolved` is the value after applicable defaults. `TContribution` is what a default source can supply. `TGuaranteed` is `true` when an applicable static default guarantees a defined resolved value.

`eq` receives defined explicit values. Absence is handled before it is called, and a supported `null` is a value.

`resolve` receives the explicit value or `undefined`, plus the applicable default. A param that guarantees a resolved value must return one. `paramContract` is a type-only marker.

`AnyDefinedQueryParam` is `DefinedQueryParam<any, any, any, boolean>`.

## ParamContract

```ts
interface ParamContract<TExplicit, TResolved, TContribution, TGuaranteed extends boolean> {
  explicit: TExplicit
  resolved: TResolved
  contribution: TContribution
  guaranteed: TGuaranteed
}
```

## DefinedQueryParamWithDefault

```ts
type DefinedQueryParamWithDefault<T> = DefinedQueryParam<T, T, T, true>
```

## QueryParamReadContext

```ts
interface QueryParamReadContext {
  onInvalid: (path: string, raw: unknown) => void
}
```

Receives diagnostics while a param reads a query. `onInvalid` gets the path and raw value of each present value its codec cannot parse.

## QueryParamTransform

```ts
interface QueryParamTransform<TInput, TOutput, TWrite = TInput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TWrite
  eq?: (a: TOutput, b: TOutput) => boolean
}
```

`read` receives the resolved input and is not called while the input is absent. `write` returns the explicit input.

## QueryParamBuilder

```ts
interface QueryParamBuilder<T, TContribution = T, TGuaranteed extends boolean = false>
  extends DefinedQueryParam<T, T, TContribution, TGuaranteed> {
  withDefault: (defaultValue: TContribution) => QueryParamBuilder<T, TContribution, true>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TContribution, TGuaranteed>
  keepOnDefault: () => QueryParamBuilder<T, TContribution, TGuaranteed>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}
```

## QueryParamBuilderWithDefault

```ts
type QueryParamBuilderWithDefault<T, TContribution = T> = QueryParamBuilder<T, TContribution, true>
```

## Related guide

[Defining params](/guide/query-state/defining-params).
