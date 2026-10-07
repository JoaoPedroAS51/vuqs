# getPath <Badge type="info" text="@vuqs/core" />

Reads a query value at a dot-path.

## Usage

```ts
import { getPath } from '@vuqs/core'

getPath({ filters: { sort: 'name' } }, 'filters.sort')
// 'name'
```

## Type

```ts
function getPath(query: ParsedQuery, path: string): ParsedQueryValue
```

## Parameters

- `query: ParsedQuery`
  - The parsed query object.
- `path: string`
  - The dot-path to read.

## Return value

- `value: ParsedQueryValue`
  - The value at `path`, or `undefined` when it does not resolve.

## Related guide

[Custom codecs](/guide/codecs/custom).
