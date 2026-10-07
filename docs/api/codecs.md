# API: codecs

The built-in codecs, the factories that build them, and `createCodec` for your own.
For usage examples, see the [Codecs guide](/guide/codecs/built-in).

## codecs <Badge type="info" text="@vuqs/core" />

A namespace of built-in codecs and codec factories. Every codec's `parse` returns
`undefined` for absent **or invalid** input.

| Member | Kind | Value type | Notes |
| --- | --- | --- | --- |
| `codecs.string` | codec | `string` | Empty/whitespace-only → absent. |
| `codecs.integer` | codec | `number` | Number or base-10 string; serialize truncates toward zero. |
| `codecs.float` | codec | `number` | Non-finite → absent. |
| `codecs.boolean` | codec | `boolean` | Boolean or `'true'`/`'false'`. |
| `codecs.index` | codec | `number` | 1-based URL ⇄ 0-based value. |
| `codecs.hex` | codec | `number` | Non-negative; serialize pads to even length. |
| `codecs.timestamp` | codec | `Date` | Milliseconds since epoch; `eq` by `valueOf`. |
| `codecs.isoDate` | codec | `Date` | `YYYY-MM-DD`, midnight UTC. |
| `codecs.isoDateTime` | codec | `Date` | Full ISO-8601. |
| `codecs.arrayOf(codec)` | factory | `T[]` | Repeated-key arrays; drops invalid items. |
| `codecs.literal(values)` | factory | string union | Outside the set → absent. |
| `codecs.numberLiteral(values)` | factory | number union | Outside the set → absent. |
| `codecs.enum(enumObject)` | factory | enum members | TS `enum`; outside it → absent. |
| `codecs.json(options?)` | factory | `T` | JSON text or parsed value; optional `validate`. |

### codecs.arrayOf <Badge type="info" text="@vuqs/core" />

```ts
function arrayOf<T>(codec: Codec<T>): Codec<T[]>
```

**Parameters**

- `codec: Codec<T>`
  - The codec applied to each item.

**Returns**

- `codec: Codec<T[]>`
  - A codec for a list over repeated keys. A scalar value is treated as a one-item
    array, items the inner codec rejects are dropped, and an empty result is absent.
    Equality is element-wise.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'

const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
// ?tags=vue&tags=urls → ['vue', 'urls']
```

### codecs.literal <Badge type="info" text="@vuqs/core" />

```ts
function literal<const T extends string>(values: readonly T[]): Codec<T>
```

**Parameters**

- `values: readonly T[]`
  - The accepted strings. Use `as const` so `T` narrows to the union. Any value
    outside the set parses as absent.

**Returns**

- `codec: Codec<T>`
  - A codec for the string union.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'

const sort = useQueryState('sort', codecs.literal(['asc', 'desc'] as const))
//    ^? QueryStateRef<'asc' | 'desc' | undefined>
```

### codecs.numberLiteral <Badge type="info" text="@vuqs/core" />

```ts
function numberLiteral<const T extends number>(values: readonly T[]): Codec<T>
```

**Parameters**

- `values: readonly T[]`
  - The accepted numbers. The numeric counterpart of `literal`.

**Returns**

- `codec: Codec<T>`
  - A codec for the number union.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'

const size = useQueryState('size', codecs.numberLiteral([10, 20, 50] as const))
```

### codecs.enum <Badge type="info" text="@vuqs/core" />

```ts
enum<const T extends Record<string, string | number>>(enumObject: T): Codec<T[keyof T]>
```

**Parameters**

- `enumObject: T`
  - A TypeScript `enum`, or a plain `as const` object of strings and numbers. The
    accepted values are read from the object, so callers pass the enum directly
    rather than `Object.values(...)`.

**Returns**

- `codec: Codec<T[keyof T]>`
  - A codec for the enum's member union. String, numeric, and heterogeneous enums
    are supported. A numeric member round-trips through its number rather than its
    key, and any value outside the enum parses as absent.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'

enum Status {
  Active = 'active',
  Archived = 'archived',
}

const status = useQueryState('status', codecs.enum(Status))
//    ^? QueryStateRef<Status | undefined>
```

### codecs.json <Badge type="info" text="@vuqs/core" />

```ts
function json<T>(options: { validate: StandardSchemaV1<unknown, T> }): Codec<T>
function json<T>(options?: { validate?: (value: unknown) => T }): Codec<T>
function json<T>(options: {
  validate?: ((value: unknown) => T) | StandardSchemaV1<unknown, T>
}): Codec<T>
```

**Parameters**

- `options.validate`: a callback or a synchronous Standard Schema. Receives the
  decoded or already-parsed value once. The callback return value or schema
  output is the codec result. Omit it to accept the value as `T` without validation.

**Returns**

- `codec: Codec<T>`
  - A codec that reads JSON text or an already-parsed value and serializes with
    `JSON.stringify`. Incoming arrays are read in full. Nullish nodes, non-finite
    numeric nodes, invalid JSON text, validation issues, and validator throws
    parse as absent. The returned codec's `parse` throws `TypeError` when a
    Standard Schema returns a Promise.
  - The validator output must round-trip through `JSON.stringify` and validation.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'
import { z } from 'zod'

const priceSchema = z.object({ min: z.number(), max: z.number() })
const range = useQueryState('range', codecs.json({ validate: priceSchema }))
```

## createCodec <Badge type="info" text="@vuqs/core" />

Builds a codec from a `parse`/`serialize` pair, the extension point for custom and
adapted value shapes. See [Custom codecs](/guide/codecs/custom).

```ts
function createCodec<T>(input: CodecInput<T>): Codec<T>
```

**Parameters**

- `input: CodecInput<T>`
  - `parse: (raw: ParsedQueryValue) => T | undefined`: decode a value, or `undefined`
    when absent or invalid. **Never throw.**
  - `serialize: (value: T) => ParsedQueryValue`: encode a value back into a query
    value.
  - `eq?: (a: T, b: T) => boolean`: optional equality, defaulting to a deep
    structural compare (`structuralEq`).

**Returns**

- `codec: Codec<T>`
  - The codec with `.withDefault()` and `.nullable()` modifiers.
  - `parse`, `serialize`, `eq`: as supplied, with `eq` defaulted.
  - `readonly defaultValue?: T`: present only after `.withDefault()`.
  - `withDefault(defaultValue: T): CodecWithDefault<T>`: see [`Codec.withDefault`](#codec-withdefault).
  - `nullable(): Codec<T | null>`: see [`Codec.nullable`](#codec-nullable).

**Example**

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

## Codec.withDefault <Badge type="info" text="@vuqs/core" />

Returns a variant of a codec carrying `defaultValue`. The codec's `parse` stays raw
(`undefined` when absent or invalid); the param that binds the codec resolves the
default, so it applies in one place rather than being baked into `parse`.

```ts
function withDefault<T>(defaultValue: T): CodecWithDefault<T>
```

**Parameters**

- `defaultValue: T`
  - The value an absent or invalid key reads back as.

**Returns**

- `codec: CodecWithDefault<T>`
  - A codec exposing `defaultValue`. Bound refs read as `T`, resolving absence to
    the default. A written value equal to the default is omitted from the URL
    ([`clearOnDefault`](/guide/essentials/navigation-options#clearondefault)).

**Example**

```ts
import { codecs } from '@vuqs/core'

codecs.integer // Codec<number>            → ref is number | undefined
codecs.integer.withDefault(1) // CodecWithDefault<number> → ref is number
```

## Codec.nullable <Badge type="info" text="@vuqs/core" />

```ts
interface Codec<T> {
  nullable: () => Codec<T | null>
}

interface CodecWithDefault<T> extends Codec<T> {
  nullable: () => CodecWithDefault<T | null>
}
```

**Parameters**

None.

**Returns**

- `codec: Codec<T | null> | CodecWithDefault<T | null>`
  - A new codec accepting `null`. A defaulted codec returns a
    `CodecWithDefault<T | null>` carrying the same default.
  - `serialize(null)` returns `undefined`, omitting the param from the URL. Other
    values use the original serializer.
  - `parse` is unchanged, including absence and invalid-input handling.
  - `eq` treats two `null` values as equal and `null` versus a non-null value as
    unequal. Other comparisons use the original equality function.
  - Add `.withDefault(null)` to read absence as `null`.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'

const state = useQueryState('state', codecs.string.nullable().withDefault(null))
//    ^? QueryStateRef<string | null>

state.set('active')
state.set(null) // remove the param; state reads null
```
