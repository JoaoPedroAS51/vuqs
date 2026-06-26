# API: codecs

The built-in codecs, the factories that build them, and `createCodec` for your
own. For a narrative tour, see the [Codecs guide](/guide/codecs).

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
| `codecs.json(options?)` | factory | `T` | Invalid JSON → absent; optional `validate`. |

### codecs.arrayOf

```ts
function arrayOf<T>(codec: Codec<T>): Codec<T[]>
```

Wraps another codec for a list. A scalar value is treated as a one-item array;
items the inner codec rejects are dropped; an empty result is absent. Equality is
element-wise.

```ts
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
// ?tags=vue&tags=urls → ['vue', 'urls']
```

### codecs.literal

```ts
function literal<const T extends string>(values: readonly T[]): Codec<T>
```

Constrains to a fixed set of strings. Use `as const` for a narrowed union type.

```ts
const sort = useQueryState('sort', codecs.literal(['asc', 'desc'] as const))
//    ^? QueryStateRef<'asc' | 'desc' | undefined>
```

### codecs.numberLiteral

```ts
function numberLiteral<const T extends number>(values: readonly T[]): Codec<T>
```

The numeric counterpart of `literal`.

### codecs.json

```ts
function json<T>(options?: { validate?: (value: unknown) => T }): Codec<T>
```

Encodes any JSON-serializable value. Invalid JSON is absent. `validate` runs on
the decoded value and may throw to reject (caught and treated as absent), so a
schema parser like Zod's `.parse` works directly.

```ts
const range = useQueryState('range', codecs.json({ validate: priceSchema.parse }))
```

## createCodec <Badge type="info" text="@vuqs/core" />

Builds a codec from a `parse`/`serialize` pair — the extension point for custom
and adapted value shapes. See [Custom codecs](/guide/custom-codecs).

### Signature

```ts
function createCodec<T>(input: CodecInput<T>): Codec<T>
```

### Parameters

```ts
interface CodecInput<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq?: (a: T, b: T) => boolean // defaults to structuralEq
}
```

| Property | Type | Description |
| --- | --- | --- |
| `parse` | `(raw) => T \| undefined` | Decode a value, or `undefined` when absent or invalid. **Never throw.** |
| `serialize` | `(value) => ParsedQueryValue` | Encode a value back into a query value. |
| `eq` | `(a, b) => boolean` | Optional equality; defaults to a deep structural compare. |

### Returns

A `Codec<T>`, including a `.withDefault()` factory:

```ts
interface Codec<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq: (a: T, b: T) => boolean
  readonly defaultValue?: T
  withDefault: (defaultValue: T) => CodecWithDefault<T>
}
```

### Example

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

Returns a variant of a codec whose `parse` falls back to `defaultValue` instead of
`undefined`.

### Signature

```ts
function withDefault<T>(defaultValue: T): CodecWithDefault<T>
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `defaultValue` | `T` | The value an absent or invalid key reads back as. |

### Returns

A `CodecWithDefault<T>` (`parse` returns `T`, and `defaultValue` is exposed), which
downstream APIs use to narrow refs to non-nullable and to drop the value from the
URL when it equals the default ([`clearOnDefault`](/guide/navigation-options#clearondefault)).

### Example

```ts
codecs.integer                 // Codec<number>            → ref is number | undefined
codecs.integer.withDefault(1)  // CodecWithDefault<number> → ref is number
```
