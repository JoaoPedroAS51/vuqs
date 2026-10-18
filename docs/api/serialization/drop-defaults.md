# dropDefaults <Badge type="info" text="@vuqs/core" />

Filters values according to the schema's static defaults. A value is dropped only when its serialized form decodes to a value equal to the default and the complete static read is unchanged without it.

## Usage

```ts
import { codecs, defineQuerySchema, dropDefaults } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

dropDefaults(schema, { q: 'phone', page: 1 })
// { q: 'phone' }
```

## Type

```ts
function dropDefaults<TSchema extends QueryStateSchema>(schema: TSchema, values: QueryStateValues<TSchema>): QueryStateValues<TSchema>
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `values: QueryStateValues<TSchema>`
  - The values keyed by logical param name.

## Return value

- `values: QueryStateValues<TSchema>`
  - A new map without `undefined` values or values equal to a static default, unless the param disables `clearOnDefault`. Retained entries are the supplied values, never filled with defaults. An object declared with `withDefaultsWhenPresent()` is retained because removing it would make it absent.

## Related guide

[Building URLs](/guide/query-state/building-urls).
