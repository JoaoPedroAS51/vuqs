# testParseThenSerialize <Badge type="tip" text="@vuqs/core/testing" />

Checks the other direction: `serialize(parse(serialized))` equals `serialized`
([structurally](/api/utils/structural-eq)).

## Usage

```ts
import { codecs } from '@vuqs/core'
import { testParseThenSerialize } from '@vuqs/core/testing'
import { expect } from 'vitest'

expect(testParseThenSerialize(codecs.integer, '42')).toBe(true)
expect(() => testParseThenSerialize(codecs.integer, 'not-a-number')).toThrow()
```

## Type

```ts
function testParseThenSerialize<T>(codec: Codec<T>, serialized: ParsedQueryValue): boolean
```

## Parameters

- `codec: Codec<T>`
  - The codec under test.
- `serialized: ParsedQueryValue`
  - The codec's **canonical** raw form. A non-canonical input like `'007'`
    round-trips to `'7'` and is reported as a mismatch by design.

## Return value

- `valid: boolean`
  - `true` when the round-trip succeeds. **Throws** if `parse` rejects the input, or if the
    re-serialized value differs.

## Related guide

[Testing](/guide/testing).
