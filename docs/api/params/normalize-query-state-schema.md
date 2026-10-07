# normalizeQueryStateSchema <Badge type="info" text="@vuqs/core" />

Normalizes codec shorthand into param definitions while preserving existing definitions.

## Usage

```ts
import { codecs, normalizeQueryStateSchema } from '@vuqs/core'

const schema = normalizeQueryStateSchema({ q: codecs.string })
schema.q.paths // ['q']
```

## Type

```ts
function normalizeQueryStateSchema<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
): NormalizeQueryStateSchema<TSchema>
```

## Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | `TSchema extends QueryStateSchemaInput` | Codecs or definitions keyed by logical param name. |

## Return value

`NormalizeQueryStateSchema<TSchema>`. Codec entries become definitions owning their logical name as a query path. Existing definitions are retained.

## Related guide

[Reusable schemas](/guide/query-state/defining-params#reusing-a-schema).
