# deletePath <Badge type="info" text="@vuqs/core" />

Deletes a query key at a dot-path.

## Usage

```ts
import { deletePath } from '@vuqs/core'

const query = { filters: { sort: 'name', category: 'books' } }
deletePath(query, 'filters.sort')
// query: { filters: { category: 'books' } }
```

## Type

```ts
function deletePath(target: ParsedQueryRaw, path: string): void
```

## Parameters

- `target: ParsedQueryRaw`
  - The query object to mutate.
- `path: string`
  - The dot-path to delete.

## Return value

- `void`
  - Deletes the key in place, preserving siblings. Empty ancestors are not pruned.

## Related guide

[Custom codecs](/guide/codecs/custom).
