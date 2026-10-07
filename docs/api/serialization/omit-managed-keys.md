# omitManagedKeys <Badge type="info" text="@vuqs/core" />

Removes the query keys owned by a schema.

## Usage

```ts
import { codecs, defineQuerySchema, omitManagedKeys } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

omitManagedKeys(schema, { q: 'phone', keep: 'yes' })
// { keep: 'yes' }
```

## Type

```ts
function omitManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema, query: ParsedQuery): ParsedQueryRaw
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `query: ParsedQuery`
  - The parsed query object.

## Return value

- `query: ParsedQueryRaw`
  - A cloned query with managed keys removed. Only ancestors emptied by the removal are pruned; unmanaged params are preserved.

## Related guide

[Building URLs](/guide/query-state/building-urls).
