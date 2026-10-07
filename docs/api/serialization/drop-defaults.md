# dropDefaults <Badge type="info" text="@vuqs/core" />

Filters values according to the schema's static defaults.

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
  - A new map without `undefined` values or values equal to a static default, unless the param disables `clearOnDefault`.

## Related guide

[Building URLs](/guide/query-state/building-urls).
