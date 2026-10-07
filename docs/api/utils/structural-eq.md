# structuralEq <Badge type="info" text="@vuqs/core" />

The deep structural comparison used as the default codec `eq`.

## Usage

```ts
import { structuralEq } from '@vuqs/core'

structuralEq({ tags: ['vue'] }, { tags: ['vue'] }) // true
```

## Type

```ts
function structuralEq(a: unknown, b: unknown): boolean
```

## Parameters

- `a: unknown`
  - The first value.
- `b: unknown`
  - The second value.

## Return value

- `equal: boolean`
  - Whether the values are structurally equal.

## Related guide

[Custom codecs](/guide/codecs/custom).
