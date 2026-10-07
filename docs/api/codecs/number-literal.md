# codecs.numberLiteral <Badge type="info" text="@vuqs/core" />

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const size = useQueryState('size', codecs.numberLiteral([10, 20, 50] as const))
```

## Type

```ts
function numberLiteral<const T extends number>(values: readonly T[]): Codec<T>
```

## Parameters

- `values: readonly T[]`
  - The accepted numbers. The numeric counterpart of `literal`.

## Return value

- `codec: Codec<T>`
  - A codec for the number union.

## Related guide

[Codecs](/guide/codecs/built-in).
