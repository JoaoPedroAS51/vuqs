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
interface DefinedQueryParam<T> {
  readonly paths: readonly string[]
  read: (query: ParsedQuery, context?: { onInvalid: (path: string, raw: unknown) => void }) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  resolve?: (selection: T, defaults: T | undefined) => T
  readonly defaultValue?: T
  readonly clearOnDefault?: boolean
  readonly presenceGated?: boolean
}
```

## DefinedQueryParamWithDefault

```ts
interface DefinedQueryParamWithDefault<T> extends DefinedQueryParam<T> {
  readonly defaultValue: T
}
```

## QueryParamTransform

```ts
interface QueryParamTransform<TInput, TOutput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TInput
  eq?: (a: TOutput, b: TOutput) => boolean
}
```

## QueryParamBuilder

```ts
interface QueryParamBuilder<T, TDefaultInput = T> extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}
```

## QueryParamBuilderWithDefault

```ts
interface QueryParamBuilderWithDefault<T, TDefaultInput = T>
  extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilderWithDefault<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}
```

## Related guide

[Defining params](/guide/query-state/defining-params).
