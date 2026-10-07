# createCodec <Badge type="info" text="@vuqs/core" />

Builds a codec from a `parse`/`serialize` pair, the extension point for custom and
adapted value shapes. See [Custom codecs](/guide/codecs/custom).

## Usage

```ts
import { createCodec, getQueryString } from '@vuqs/core'

const percent = createCodec<number>({
  parse: (raw) => {
    const value = getQueryString(raw)
    return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined
  },
  serialize: value => String(value),
})
```

## Type

```ts
function createCodec<T>(input: CodecInput<T>): Codec<T>
```

## Parameters

- `input: CodecInput<T>`
  - `parse: (raw: ParsedQueryValue) => T | undefined`: decode a value, or `undefined`
    when absent or invalid. **Never throw.**
  - `serialize: (value: T) => ParsedQueryValue`: encode a value back into a query
    value.
  - `eq?: (a: T, b: T) => boolean`: optional equality, defaulting to a deep
    structural compare (`structuralEq`).

## Return value

- `codec: Codec<T>`
  - The codec with `.withDefault()` and `.nullable()` modifiers.
  - `parse`, `serialize`, `eq`: as supplied, with `eq` defaulted.
  - `readonly defaultValue?: T`: present only after `.withDefault()`.
  - `withDefault(defaultValue: T): CodecWithDefault<T>`: see [`Codec.withDefault`](/api/codecs#codec-withdefault).
  - `nullable(): Codec<T | null>`: see [`Codec.nullable`](/api/codecs#codec-nullable).

## CodecInput

```ts
interface CodecInput<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq?: (a: T, b: T) => boolean
}
```

## Related guide

[Codecs](/guide/codecs/custom).
