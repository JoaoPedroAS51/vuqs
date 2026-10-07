# parseQueryStates <Badge type="info" text="@vuqs/core" />

Parses selections from a query.

## Usage

```ts
import { codecs, defineQuerySchema, parseQueryStates } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

parseQueryStates(schema, { q: 'phone', page: '2' })
// { q: 'phone', page: 2 }
```

## Type

```ts
function parseQueryStates<TSchema extends QueryStateSchema>(schema: TSchema, query: ParsedQuery): QueryStateValues<TSchema>
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `query: ParsedQuery`
  - The parsed query object.

## Return value

- `values: QueryStateValues<TSchema>`
  - Selections present in the query. Absent or invalid params are omitted; defaults are not resolved.

## Related guide

[Building URLs](/guide/query-state/building-urls).
