# getQueryString <Badge type="info" text="@vuqs/core" />

Reads one non-empty string from a query value.

## Usage

```ts
import { getQueryString } from '@vuqs/core'

getQueryString(['phone', 'laptop']) // 'phone'
getQueryString('   ') // undefined
```

## Type

```ts
function getQueryString(value: ParsedQueryValue): string | undefined
```

## Parameters

- `value: ParsedQueryValue`
  - A scalar or array query value.

## Return value

- `value: string | undefined`
  - A non-empty string from the scalar value or first array item. Other values return `undefined`.

## Related guide

[Custom codecs](/guide/codecs/custom).
