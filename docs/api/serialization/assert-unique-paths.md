# assertUniquePaths <Badge type="info" text="@vuqs/core" />

Checks that params do not share query paths.

## Usage

```ts
import { codecs, defineQuerySchema, assertUniquePaths } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

assertUniquePaths(schema)
```

## Type

```ts
function assertUniquePaths<TSchema extends QueryStateSchema>(schema: TSchema): void
```

## Parameters

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.

## Return value

- `void`
  - Returns normally when paths are unique. Throws if two params declare the same query path.

## Related guide

[Building URLs](/guide/query-state/building-urls).
