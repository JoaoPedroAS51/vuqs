# getManagedKeys <Badge type="info" text="@vuqs/core" />

Lists the query paths declared by a schema.

## Usage

```ts
import { codecs, defineQuerySchema, getManagedKeys } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

getManagedKeys(schema)
// ['q', 'page']
```

## Type

```ts
function getManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema): string[]
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.

## Return value

- `paths: string[]`
  - The query paths owned by the schema, in declaration order.

## Related guide

[Building URLs](/guide/query-state/building-urls).
