# testSerializeThenParse <Badge type="tip" text="@vuqs/core/testing" />

Checks one direction: `parse(serialize(input))` equals `input` (by `codec.eq`).

## Usage

```ts
import { codecs } from '@vuqs/core'
import { testSerializeThenParse } from '@vuqs/core/testing'
import { expect } from 'vitest'

expect(testSerializeThenParse(codecs.integer, 42)).toBe(true)
expect(() => testSerializeThenParse(codecs.integer, Number.NaN)).toThrow()
```

## Type

```ts
function testSerializeThenParse<T>(codec: Codec<T>, input: T): boolean
```

## Parameters

- `codec: Codec<T>`
  - The codec under test.
- `input: T`
  - The value to serialize and parse back.

## Return value

- `valid: boolean`
  - `true` when the round-trip succeeds. **Throws** if the codec rejects its own serialized
    output, or if the round-tripped value differs.

## Related guide

[Testing](/guide/testing).
