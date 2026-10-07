# getQueryStringArray <Badge type="info" text="@vuqs/core" />

Reads non-empty strings from a query value.

## Usage

```ts
import { getQueryStringArray } from '@vuqs/core'

getQueryStringArray(['phone', '', 'laptop'])
// ['phone', 'laptop']
```

## Type

```ts
function getQueryStringArray(value: ParsedQueryValue): string[]
```

## Parameters

- `value: ParsedQueryValue`
  - A scalar or array query value.

## Return value

- `values: string[]`
  - Non-empty strings in order. Invalid items are dropped; an absent or invalid value returns `[]`.

## Related guide

[Custom codecs](/guide/codecs/custom).
