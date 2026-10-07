# defineQuerySchema <Badge type="info" text="@vuqs/core" />

Names a reusable [schema](/guide/query-state/defining-params#reusing-a-schema),
normalized so its type stays stable across composables and `typeof` derivations.

## Usage

```ts
import { codecs, defineQuerySchema, queryParam } from '@vuqs/core'

export const filters = defineQuerySchema({
  q: codecs.string,
  status: queryParam('status', codecs.literal(['open', 'closed'] as const)),
})
```

## Type

```ts
function defineQuerySchema<const TSchema extends QueryStateSchemaInput>(schema: TSchema): NormalizeQueryStateSchema<TSchema>
```

## Parameters

- `schema: TSchema`
  - A map of logical name to a codec or a [`queryParam`](/api/params/query-param) definition,
    the same input `useQueryStates` accepts.

## Return value

- `schema: NormalizeQueryStateSchema<TSchema>`
  - The schema with codec-shorthand entries normalized to `DefinedQueryParam`. Pass
    it to `useQueryStates` or [`createSerializer`](/api/serialization/create-serializer),
    and derive value types with `QueryStateValues<typeof schema>`.

## NormalizeQueryStateSchema

```ts
type NormalizeQueryStateSchema<TSchema extends QueryStateSchemaInput> = {
  [Key in keyof TSchema]: TSchema[Key] extends DefinedQueryParam<any>
    ? TSchema[Key]
    : TSchema[Key] extends Codec<infer TValue>
      ? TSchema[Key] extends { readonly defaultValue: infer TDefault }
        ? DefinedQueryParamWithDefault<TDefault>
        : DefinedQueryParam<TValue>
      : never
}
```

## Related guide

[Defining params](/guide/query-state/defining-params).
