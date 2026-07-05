# API: codecs

The built-in codecs, the factories that build them, and `createCodec` for your own.
For a narrative tour, see the [Codecs guide](/guide/codecs/built-in).

## codecs <Badge type="info" text="@vuqs/core" />

A namespace of built-in codecs and codec factories. Every codec's `parse` returns
`undefined` for absent **or invalid** input.

| Member | Kind | Value type | Notes |
| --- | --- | --- | --- |
| `codecs.string` | codec | `string` | Empty/whitespace-only → absent. |
| `codecs.integer` | codec | `number` | Base-10; serialize truncates toward zero. |
| `codecs.float` | codec | `number` | Non-finite → absent. |
| `codecs.boolean` | codec | `boolean` | Only `'true'`/`'false'`. |
| `codecs.index` | codec | `number` | 1-based URL ⇄ 0-based value. |
| `codecs.hex` | codec | `number` | Non-negative; serialize pads to even length. |
| `codecs.timestamp` | codec | `Date` | Milliseconds since epoch; `eq` by `valueOf`. |
| `codecs.isoDate` | codec | `Date` | `YYYY-MM-DD`, midnight UTC. |
| `codecs.isoDateTime` | codec | `Date` | Full ISO-8601. |
| `codecs.arrayOf(codec)` | factory | `T[]` | Repeated-key arrays; drops invalid items. |
| `codecs.literal(values)` | factory | string union | Outside the set → absent. |
| `codecs.numberLiteral(values)` | factory | number union | Outside the set → absent. |
| `codecs.enum(enumObject)` | factory | enum members | TS `enum`; outside it → absent. |
| `codecs.json(options?)` | factory | `T` | Invalid JSON → absent; optional `validate`. |

### codecs.arrayOf

```ts
function arrayOf<T>(codec: Codec<T>): Codec<T[]>
```

**Parameters**

- `codec: Codec<T>`
  - The codec applied to each item.

**Returns**

- `Codec<T[]>`
  - A codec for a list over repeated keys. A scalar value is treated as a one-item
    array, items the inner codec rejects are dropped, and an empty result is absent.
    Equality is element-wise.

```ts
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
// ?tags=vue&tags=urls → ['vue', 'urls']
```

### codecs.literal

```ts
function literal<const T extends string>(values: readonly T[]): Codec<T>
```

**Parameters**

- `values: readonly T[]`
  - The accepted strings. Use `as const` so `T` narrows to the union. Any value
    outside the set parses as absent.

**Returns**

- `Codec<T>`
  - A codec for the string union.

```ts
const sort = useQueryState('sort', codecs.literal(['asc', 'desc'] as const))
//    ^? QueryStateRef<'asc' | 'desc' | undefined>
```

### codecs.numberLiteral

```ts
function numberLiteral<const T extends number>(values: readonly T[]): Codec<T>
```

**Parameters**

- `values: readonly T[]`
  - The accepted numbers. The numeric counterpart of `literal`.

**Returns**

- `Codec<T>`
  - A codec for the number union.

### codecs.enum

```ts
enum<const T extends Record<string, string | number>>(enumObject: T): Codec<T[keyof T]>
```

**Parameters**

- `enumObject: T`
  - A TypeScript `enum`, or a plain `as const` object of strings and numbers. The
    accepted values are read from the object, so callers pass the enum directly
    rather than `Object.values(...)`.

**Returns**

- `Codec<T[keyof T]>`
  - A codec for the enum's member union. String, numeric, and heterogeneous enums
    are supported. A numeric member round-trips through its number rather than its
    key, and any value outside the enum parses as absent.

```ts
enum Status {
  Active = 'active',
  Archived = 'archived',
}

const status = useQueryState('status', codecs.enum(Status))
//    ^? QueryStateRef<Status | undefined>
```

### codecs.json

```ts
function json<T>(options?: { validate?: (value: unknown) => T }): Codec<T>
```

**Parameters**

- `options?: { validate?: (value: unknown) => T }`
  - `validate?: (value: unknown) => T`: runs on the decoded value and may throw to
    reject. A throw is caught and treated as absent, so a schema parser like Zod's
    `.parse` works directly. Omit it to accept any parsed JSON as `T`.

**Returns**

- `Codec<T>`
  - A codec that encodes any JSON-serializable value. Invalid JSON parses as absent.

```ts
const range = useQueryState('range', codecs.json({ validate: priceSchema.parse }))
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
  - The codec, plus a `.withDefault()` factory.
  - `parse`, `serialize`, `eq`: as supplied, with `eq` defaulted.
  - `readonly defaultValue?: T`: present only after `.withDefault()`.
  - `withDefault(defaultValue: T): CodecWithDefault<T>`: see [`Codec.withDefault`](#codec-withdefault).

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
  - A codec exposing `defaultValue`. Downstream APIs use it to narrow refs to
    non-nullable and to drop the value from the URL when it equals the default
    ([`clearOnDefault`](/guide/essentials/navigation-options#clearondefault)).

```ts
codecs.integer // Codec<number>            → ref is number | undefined
codecs.integer.withDefault(1) // CodecWithDefault<number> → ref is number
```
