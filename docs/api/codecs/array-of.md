# codecs.arrayOf <Badge type="info" text="@vuqs/core" />

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
// ?tags=vue&tags=urls → ['vue', 'urls']
```

## Type

```ts
function arrayOf<T>(codec: Codec<T>): Codec<T[]>
```

## Parameters

- `codec: Codec<T>`
  - The codec applied to each item.

## Return value

- `codec: Codec<T[]>`
  - A codec for a list over repeated keys. A scalar value is treated as a one-item
    array, items the inner codec rejects are dropped, and an empty result is absent.
    Equality is element-wise.

## Related guide

[Codecs](/guide/codecs/built-in).
