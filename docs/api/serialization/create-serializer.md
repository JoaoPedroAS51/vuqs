# createSerializer <Badge type="info" text="@vuqs/core" />

Builds a reusable, schema-bound function that turns values into a query.

## Usage

```ts
import { codecs, createSerializer, defineQuerySchema } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer })
const serialize = createSerializer(schema)

serialize({ q: 'phone' }) // { q: 'phone' }
serialize({ q: 'old', page: '1' }, { page: 2 }) // { q: 'old', page: '2' }
serialize({ q: 'old' }, { q: undefined }) // {}
```

## Type

```ts
function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify, parse: SerializerParse },
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery | string, string>

function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify },
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery, string>

function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { parse: SerializerParse },
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery | string, ParsedQueryRaw>

function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options?: CreateSerializerOptions,
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery, ParsedQueryRaw>
```

## Parameters

- `schema: TSchema`
  - Codecs or param definitions keyed by logical name. Codec inputs are normalized
    before serialization.
- `options?: CreateSerializerOptions`
  - `clearOnDefault?: boolean`: default `true`. Drop a value when it equals its codec default.
  - `stringify?: (query: ParsedQueryRaw) => string`: enables string output. Provide it to return a query string instead of a query object.
  - `parse?: (search: string) => ParsedQuery`: enables a string base. Provide it to accept a raw query string as the base argument.
  - `stringify` controls output; `parse` controls the accepted base. They can be
    supplied independently.

## Return value

- `serialize: Serializer`
  - Callable two ways: `serialize(values)` builds a fresh query from `values`, and
    `serialize(base, values)` patches `values` over a `base` query.
  - Omitted params are preserved, `undefined` clears, and a value sets.
    Unmanaged base params are preserved.
  - **Throws** if a string base is passed without a `parse` option.

## CreateSerializerOptions

```ts
interface CreateSerializerOptions {
  clearOnDefault?: boolean
  stringify?: (query: ParsedQueryRaw) => string
  parse?: (search: string) => ParsedQuery
}
```

## Serializer

```ts
interface Serializer<TSchema extends QueryStateSchema, TBase, TOutput> {
  (values: QueryStateWriteValues<TSchema>): TOutput
  (base: TBase, values: QueryStateWriteValues<TSchema>): TOutput
}
```

## SerializerStringify

```ts
type SerializerStringify = (query: ParsedQueryRaw) => string
```

## SerializerParse

```ts
type SerializerParse = (search: string) => ParsedQuery
```

## Related guide

[Building URLs](/guide/query-state/building-urls).
