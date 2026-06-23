# API: codecs

`import { codecs, createCodec } from 'vuqs'`

For a narrative tour with examples, see the [Codecs guide](/guide/codecs). This
page is the reference.

## `codecs`

A namespace of built-in codecs and codec factories.

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

Every codec's `parse` returns `undefined` for absent **or invalid** input.

### `codecs.arrayOf`

```ts
function arrayOf<T>(codec: Codec<T>): Codec<T[]>
```

Wraps another codec for a list. A scalar value is treated as a one-item array;
items rejected by the inner codec are dropped; an empty result is absent. Equality
is element-wise.

### `codecs.literal`

```ts
function literal<const T extends string>(values: readonly T[]): Codec<T>
```

Constrains to a fixed set of strings. Use `as const` for a narrowed union type.

### `codecs.numberLiteral`

```ts
function numberLiteral<const T extends number>(values: readonly T[]): Codec<T>
```

The numeric counterpart of `literal`.

### `codecs.json`

```ts
function json<T>(options?: { validate?: (value: unknown) => T }): Codec<T>
```

Encodes any JSON-serializable value. Invalid JSON is absent. `validate` runs on
the decoded value and may throw to reject (caught and treated as absent), so a
schema parser like Zod's `.parse` works directly.

## `createCodec`

```ts
function createCodec<T>(input: CodecInput<T>): Codec<T>

interface CodecInput<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq?: (a: T, b: T) => boolean // defaults to structuralEq
}
```

Builds a codec from a `parse`/`serialize` pair (plus optional `eq`). The extension
point for custom and adapted value shapes — see [Custom codecs](/guide/custom-codecs).

**Returns** a `Codec<T>`:

```ts
interface Codec<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq: (a: T, b: T) => boolean
  readonly defaultValue?: T
  withDefault: (defaultValue: T) => CodecWithDefault<T>
}
```

## `Codec.withDefault`

```ts
withDefault(defaultValue: T): CodecWithDefault<T>
```

Returns a variant whose `parse` falls back to `defaultValue` instead of
`undefined`. The result is a `CodecWithDefault<T>` (`parse` returns `T`, and
`defaultValue` is exposed), which downstream APIs use to:

- narrow refs to non-nullable, and
- drop the value from the URL when it equals the default
  ([`clearOnDefault`](/guide/navigation-options#clearondefault)).

```ts
codecs.integer                 // Codec<number>          → ref is number | undefined
codecs.integer.withDefault(1)  // CodecWithDefault<number> → ref is number
```
