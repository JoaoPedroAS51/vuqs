# codecs.json <Badge type="info" text="@vuqs/core" />

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const range = useQueryState('range', codecs.json<{ min: number, max: number }>())
range.set({ min: 10, max: 50 })
```

## Type

```ts
function json<T>(options: { validate: StandardSchemaV1<unknown, T> }): Codec<T>
function json<T>(options?: { validate?: (value: unknown) => T }): Codec<T>
function json<T>(options: {
  validate?: ((value: unknown) => T) | StandardSchemaV1<unknown, T>
}): Codec<T>
```

## Parameters

- `options.validate`: a callback or a synchronous Standard Schema. Receives the
  decoded or already-parsed value once. The callback return value or schema
  output is the codec result. Omit it to accept the value as `T` without validation.

## Return value

- `codec: Codec<T>`
  - A codec that reads JSON text or an already-parsed value and serializes with
    `JSON.stringify`. Incoming arrays are read in full. Nullish nodes, non-finite
    numeric nodes, invalid JSON text, validation issues, and validator throws
    parse as absent. The returned codec's `parse` throws `TypeError` when a
    Standard Schema returns a Promise.
  - The validator output must round-trip through `JSON.stringify` and validation.

## Related guide

[Codecs](/guide/codecs/built-in).
