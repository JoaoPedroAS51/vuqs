# isCodecBijective <Badge type="tip" text="@vuqs/core/testing" />

The full bijectivity check for a [custom codec](/guide/codecs/custom): both
round-trip directions hold, and the serialized/parsed forms match the expected
values.

## Usage

```ts
import { codecs } from '@vuqs/core'
import { isCodecBijective } from '@vuqs/core/testing'
import { expect } from 'vitest'

expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
expect(() => isCodecBijective(codecs.integer, '42', 47)).toThrow()
```

## Type

```ts
function isCodecBijective<T>(codec: Codec<T>, serialized: ParsedQueryValue, input: T): boolean
```

## Parameters

- `codec: Codec<T>`
  - The codec under test.
- `serialized: ParsedQueryValue`
  - The codec's **canonical** serialized form of `input`.
- `input: T`
  - The value `serialized` should parse back to, compared by `codec.eq`.

## Return value

- `valid: boolean`
  - `true` when `serialize(input)` equals `serialized`, `parse(serialized)` equals
    `input`, and both directions round-trip. Otherwise **throws**, naming the side
    that broke.

## Related guide

[Testing](/guide/testing).
