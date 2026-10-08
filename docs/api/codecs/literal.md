# codecs.literal <Badge type="info" text="@vuqs/core" />

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const sort = useQueryState('sort', codecs.literal(['asc', 'desc']))
//    ^? QueryStateRef<'asc' | 'desc' | undefined>

const size = useQueryState('size', codecs.literal([10, 20, 50]))
//    ^? QueryStateRef<10 | 20 | 50 | undefined>
```

## Type

```ts
function literal<const T extends string>(values: readonly T[]): Codec<T>
function literal<const T extends number>(values: readonly T[]): Codec<T>
```

## Parameters

- `values: readonly T[]`
  - The accepted strings or numbers. Lists must be homogeneous. Inline lists
    infer their literal union; use `as const` when declaring a separate list.
  - Values outside the set parse as absent.
  - Mixed lists and values other than strings or numbers throw `TypeError`
    when the codec is created.

## Return value

- `codec: Codec<T>`
  - A codec for the string or number union. String lists use exact matching.
    Number lists accept finite numbers and numeric strings, so `'01'` and
    `'1.0'` both parse as `1` when allowed. Booleans are rejected.
  - Serialization returns the value as a string. An empty list accepts no values.

## Related guide

[Codecs](/guide/codecs/built-in).
