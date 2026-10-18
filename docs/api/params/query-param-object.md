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

`QueryParamObjectFactory` is an internal type; `QueryParamObjectBuilderFor<TChildren>` is `QueryParamObjectBuilder<TChildren>` with no own default and no gate.

## Parameters

| Form | Parameters | Behavior |
| --- | --- | --- |
| `queryParam.object(children)` | Codec or param map. | Composes owned paths into one object value. |
| `queryParam.object(prefix, children)` | Path prefix and child map. | Prefixes each child's owned path. |
| `queryParam.object(prefix, param)` | Path prefix and existing definition. | Returns the same builder contract under the prefixed paths. |

## Return value

An object builder. Its contracts derive from the child map:

- Explicit value: every child optional.
- Resolved value: children with an applicable static default are required, the others stay optional.
- Contribution: recursively partial through object children, whole values for other children.

A builder guarantees a defined resolved value when an own `withDefault` was set or a child guarantees one, unless `withDefaultsWhenPresent()` was applied. Child definitions determine the owned URL paths.

`withDefault` replaces the object's own contribution above its children's defaults. `withDefaultsWhenPresent()` conditions every default of the object on decoded presence in any modifier order. `withEquality` receives explicit values, so defaulted children can be absent in both arguments.

## QueryParamObjectBuilder

```ts
interface QueryParamObjectBuilder<
  TChildren extends AnyObjectChildren,
  THasOwnDefault extends boolean = false,
  TGated extends boolean = false,
> extends DefinedQueryParam<
    ObjectExplicitValue<TChildren>,
    ObjectResolvedValue<TChildren>,
    ObjectContribution<TChildren>,
    ObjectGuaranteed<TChildren, THasOwnDefault, TGated>
  > {
  withDefault: (defaultValue: ObjectContribution<TChildren>) => QueryParamObjectBuilder<TChildren, true, TGated>
  withEquality: (eq: (a: ObjectExplicitValue<TChildren>, b: ObjectExplicitValue<TChildren>) => boolean) => QueryParamObjectBuilder<TChildren, THasOwnDefault, TGated>
  keepOnDefault: () => QueryParamObjectBuilder<TChildren, THasOwnDefault, TGated>
  withDefaultsWhenPresent: () => QueryParamObjectBuilder<TChildren, THasOwnDefault, true>
  transform: <TOutput>(
    transformer: QueryParamTransform<ObjectResolvedValue<TChildren>, TOutput, ObjectExplicitValue<TChildren>>,
  ) => QueryParamBuilder<TOutput>
}
```

## PrefixedQueryParamBuilder

```ts
type PrefixedQueryParamBuilder<TParam extends AnyDefinedQueryParam> = TParam
```

A prefix rewrites query paths only, so the prefixed param keeps its contracts and modifiers.

## Object value types

```ts
type ObjectExplicitValue<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren]?: ExplicitValueOf<TChildren[Key]>
}

type ObjectResolvedValue<TChildren extends AnyObjectChildren> = {
  [Key in GuaranteedChildKeys<TChildren>]: ResolvedValueOf<TChildren[Key]>
} & {
  [Key in Exclude<keyof TChildren, GuaranteedChildKeys<TChildren>>]?: ResolvedValueOf<TChildren[Key]>
}

type ObjectContribution<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren]?: ContributionOf<TChildren[Key]>
}
```

`GuaranteedChildKeys` selects the children whose param guarantees a resolved value. The mapped types are shown without their `Simplify` wrapper. `ObjectGuaranteed`, `GuaranteedChildKeys` and `Simplify` are internal helpers.

## Related guide

[Composite params](/guide/query-state/defining-params#composite-params).
