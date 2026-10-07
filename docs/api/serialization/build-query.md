# buildQuery <Badge type="info" text="@vuqs/core" />

Replaces managed query keys with serialized values.

## Usage

```ts
import { codecs, defineQuerySchema, buildQuery } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

buildQuery(schema, { q: 'old', page: '3', keep: 'yes' }, { q: 'phone' })
// { keep: 'yes', q: 'phone' }
```

## Type

```ts
function buildQuery<TSchema extends QueryStateSchema>(schema: TSchema, currentQuery: ParsedQuery, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `currentQuery: ParsedQuery`
  - The query to update.
- `values: QueryStateValues<TSchema>`
  - The values keyed by logical param name.

## Return value

- `query: ParsedQueryRaw`
  - A new query preserving unmanaged params. Managed params absent from `values` are removed.

## Related guide

[Building URLs](/guide/query-state/building-urls).
