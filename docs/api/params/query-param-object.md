# queryParam.object <Badge type="info" text="@vuqs/core" />

Composes child codecs or params into one object param, optionally under a path prefix.

## Usage

```ts
import { codecs, queryParam, useQueryState } from '@vuqs/core'

const pagination = queryParam.object('pagination', {
  page: codecs.integer.withDefault(1),
  size: codecs.integer.withDefault(20),
})
const state = useQueryState(pagination)
state.value.page
```

## Type

```ts
interface QueryParamObjectFactory {
  <TChildren extends QueryStateSchemaInput>(
    children: TChildren,
  ): QueryParamObjectBuilderFor<NormalizeQueryStateSchema<TChildren>>
  <TChildren extends QueryStateSchemaInput>(
    prefix: string,
    children: TChildren,
  ): QueryParamObjectBuilderFor<NormalizeQueryStateSchema<TChildren>>
  <TParam extends AnyDefinedQueryParam>(
    prefix: string,
    param: TParam,
  ): PrefixedQueryParamBuilder<TParam>
}
```

`QueryParamObjectFactory` and the builder-selection aliases in these signatures are inferred internal types, not package exports.

## Parameters

| Form | Parameters | Behavior |
| --- | --- | --- |
| `queryParam.object(children)` | Codec or param map. | Composes owned paths into one object value. |
| `queryParam.object(prefix, children)` | Path prefix and child map. | Prefixes each child's owned path. |
| `queryParam.object(prefix, param)` | Path prefix and existing definition. | Preserves the builder kind and static default distinction. |

## Return value

An object builder, defaulted when its normalized children contain defaults. Defaulted children are required in its resolved value type; other children remain optional. Child definitions determine the owned URL paths.

`withDefaultsWhenPresent()` gates child defaults on object presence unless an object-level default was supplied. Object `withDefault` accepts a partial object default. Equality and default clearing follow the param's modifiers.


## QueryParamObjectBuilder

```ts
interface QueryParamObjectBuilder<T, TDefaultInput = (T extends object ? Partial<T> : T)>
  extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamObjectBuilder<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamObjectBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}
```

## QueryParamObjectBuilderWithDefault

```ts
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
```

## PrefixedQueryParamBuilder

```ts
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
```

<details>
<summary>Builder selection</summary>

```ts
type AnyDefinedQueryParam = DefinedQueryParam<any>

type AnyObjectChildren = Record<string, AnyDefinedQueryParam>

type DefinedValue<TParam> = TParam extends DefinedQueryParam<infer TValue> ? TValue : never

type Simplify<T> = { [Key in keyof T]: T[Key] } & {}

type RequiredObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? Key : never]: DefinedValue<TChildren[Key]>
}

type OptionalObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? never : Key]?: DefinedValue<TChildren[Key]>
}

type ObjectValue<TChildren extends AnyObjectChildren> = Simplify<
  RequiredObjectChildren<TChildren> & OptionalObjectChildren<TChildren>
>

type QueryParamObjectDefault<TValue> = TValue extends object ? Partial<TValue> : TValue

type HasDefaultedChildren<TChildren extends AnyObjectChildren>
  = keyof RequiredObjectChildren<TChildren> extends never ? false : true

type QueryParamObjectBuilderFor<TChildren extends AnyObjectChildren>
  = HasDefaultedChildren<TChildren> extends true
    ? QueryParamObjectBuilderWithDefault<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>, false>
    : QueryParamObjectBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>
```

These supporting aliases are not exports from `@vuqs/core`.

</details>

## Related guide

[Composite params](/guide/query-state/defining-params#composite-params).
