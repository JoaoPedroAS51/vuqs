# Shared query types

Types shared by codecs, schemas, adapters, serialization, and query state.

Import these types from `@vuqs/core`. Function-specific options and return types are documented beside their functions.

## ParsedQueryValue

```ts
type ParsedQueryValue
  = | string
    | number
    | boolean
    | null
    | undefined
    | ParsedQueryValue[]
    | { [key: string]: ParsedQueryValue }
```

## ParsedQuery

```ts
type ParsedQuery = Record<string, ParsedQueryValue>
```

## ParsedQueryRaw

```ts
type ParsedQueryRaw = Record<string, ParsedQueryValue>
```

## QueryStateSchema

```ts
type QueryStateSchema = Record<string, AnyDefinedQueryParam>
```

## QueryStateSchemaInput

```ts
type QueryStateSchemaInput = Record<string, Codec<any> | AnyDefinedQueryParam>
```

## Value contracts of a param

```ts
type ExplicitValueOf<TParam> = /* the decoded value before default resolution */
type ResolvedValueOf<TParam> = /* the value after applicable defaults, when defined */
type ContributionOf<TParam> = /* the value a default source can supply */
type GuaranteedOf<TParam> = /* true when a static default guarantees a resolved value */
```

## QueryStateValues

```ts
type QueryStateValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: ExplicitValueOf<TSchema[Key]> | undefined
}
```

## QueryStateWriteValues

```ts
type QueryStateWriteValues<TSchema extends QueryStateSchema> = QueryStateValues<TSchema>
```

## QueryStateResolvedValues

```ts
type QueryStateResolvedValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: ResolvedValueOf<TSchema[Key]> | undefined
}
```

## QueryStateContributions

```ts
type QueryStateContributions<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: ContributionOf<TSchema[Key]> | undefined
}
```

## QueryStateValueOf

```ts
type QueryStateValueOf<TDefinition> = ExplicitValueOf<TDefinition>
```

## QueryStateValueAt

```ts
type QueryStateValueAt<TSchema extends QueryStateSchema, TKey extends string>
  = TSchema extends { [Key in TKey]: infer TDefinition }
    ? QueryStateValueOf<TDefinition>
    : never
```

## QueryStateContributionAt

```ts
type QueryStateContributionAt<TSchema extends QueryStateSchema, TKey extends string>
  = TSchema extends { [Key in TKey]: infer TDefinition }
    ? ContributionOf<TDefinition>
    : never
```

## QueryStateRefValue

```ts
type QueryStateRefValue<TDefinition extends AnyDefinedQueryParam>
  = [GuaranteedOf<TDefinition>] extends [true]
    ? ResolvedValueOf<TDefinition>
    : ResolvedValueOf<TDefinition> | undefined
```

## QueryStateRefInput

```ts
type QueryStateRefInput<TDefinition extends AnyDefinedQueryParam>
  = [GuaranteedOf<TDefinition>] extends [true]
    ? ExplicitValueOf<TDefinition>
    : ExplicitValueOf<TDefinition> | undefined
```

`ParsedQuery` is the adapter's input; `ParsedQueryRaw` is serialized output. They share the same recursive node shape.

`QueryStateSchemaInput` accepts codecs or definitions. `QueryStateSchema` contains normalized definitions. Use [defineQuerySchema](/api/params/define-query-schema) when deriving types from codec shorthand.

`QueryStateValues` and `QueryStateWriteValues` hold explicit values: a composed param keeps its defaulted children optional, and explicit `undefined` is allowed. Writer behavior determines omission semantics: `patch` and the serializer preserve omitted params; `replace` and whole-object refs clear them.

`QueryStateResolvedValues` holds the values after applicable defaults. `QueryStateContributions` is what `setDefaults` and registered default sources accept.

`QueryStateRefValue` resolves the static default distinction: a param that guarantees a value yields the resolved type; another param yields it with `undefined`. `QueryStateRefInput` is the matching write type. Module read policies can affect which values are present at runtime.

## Related types

| Contract | Reference |
| --- | --- |
| Codec inputs and modifiers | [codecs](/api/codecs), [createCodec](/api/codecs/create-codec) |
| Param definitions and builders | [queryParam](/api/params/query-param) |
| Reactive values, actions, and options | [useQueryStates](/api/composables/use-query-states) |
| Single ref and module composition | [useQueryState](/api/composables/use-query-state) |
| Binding and whole-object ref | [toQueryRef](/api/composables/to-query-ref) |
| Per-param refs | [toQueryRefs](/api/composables/to-query-refs) |
| Adapter and navigation | [QueryAdapter](/api/adapters/query-adapter) |
| Serializer | [createSerializer](/api/serialization/create-serializer) |
| Engine reads and default layers | [createQueryStateEngine](/api/advanced/create-query-state-engine) |
| Module projections and factories | [defineQueryModule](/api/authoring/define-query-module) |
| Transactions | [QueryCore](/api/authoring/query-core#transactions) |
| Built-in modules | [Modules](/api/modules/) |
