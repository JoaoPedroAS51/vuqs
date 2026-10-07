# setPath <Badge type="info" text="@vuqs/core" />

Writes a query value at a dot-path.

## Usage

```ts
import { setPath } from '@vuqs/core'

setPath({}, 'filters.sort', 'name')
// { filters: { sort: 'name' } }
```

## Type

```ts
function setPath(target: ParsedQueryRaw, path: string, value: ParsedQueryValue): ParsedQueryRaw
```

## Parameters

- `target: ParsedQueryRaw`
  - The query object to mutate.
- `path: string`
  - The dot-path to write.
- `value: ParsedQueryValue`
  - The value to set.

## Return value

- `query: ParsedQueryRaw`
  - The same target object, with intermediate objects created as needed. Unsafe prototype paths leave it unchanged.

## Related guide

[Custom codecs](/guide/codecs/custom).
