# serializeQueryStates <Badge type="info" text="@vuqs/core" />

Serializes a value map into query keys.

## Usage

```ts
import { codecs, defineQuerySchema, serializeQueryStates } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

serializeQueryStates(schema, { q: 'phone', page: 2 })
// { q: 'phone', page: '2' }
```

## Type

```ts
function serializeQueryStates<TSchema extends QueryStateSchema>(schema: TSchema, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `values: QueryStateValues<TSchema>`
  - The values keyed by logical param name.

## Return value

- `query: ParsedQueryRaw`
  - A compacted nested query object. Apply `dropDefaults` first when default-valued params should be omitted.

## Related guide

[Building URLs](/guide/query-state/building-urls).
