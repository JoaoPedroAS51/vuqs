# codecs.literal <Badge type="info" text="@vuqs/core" />

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const sort = useQueryState('sort', codecs.literal(['asc', 'desc'] as const))
//    ^? QueryStateRef<'asc' | 'desc' | undefined>
```

## Type

```ts
function literal<const T extends string>(values: readonly T[]): Codec<T>
```

## Parameters

- `values: readonly T[]`
  - The accepted strings. Use `as const` so `T` narrows to the union. Any value
    outside the set parses as absent.

## Return value

- `codec: Codec<T>`
  - A codec for the string union.

## Related guide

[Codecs](/guide/codecs/built-in).
