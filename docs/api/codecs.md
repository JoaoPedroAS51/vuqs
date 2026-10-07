# codecs <Badge type="info" text="@vuqs/core" />

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
| [`codecs.arrayOf(codec)`](/api/codecs/array-of) | factory | `T[]` | Repeated-key arrays; drops invalid items. |
| [`codecs.literal(values)`](/api/codecs/literal) | factory | string union | Outside the set → absent. |
| [`codecs.numberLiteral(values)`](/api/codecs/number-literal) | factory | number union | Outside the set → absent. |
| [`codecs.enum(enumObject)`](/api/codecs/enum) | factory | enum members | TS `enum`; outside it → absent. |
| [`codecs.json(options?)`](/api/codecs/json) | factory | `T` | JSON text or parsed value; optional `validate`. |

## Codec

```ts
interface Codec<T> {
  parse: (raw: ParsedQueryValue) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq: (a: T, b: T) => boolean
  readonly defaultValue?: T
  withDefault: (defaultValue: T) => CodecWithDefault<T>
  nullable: () => Codec<T | null>
}
```

## CodecWithDefault

```ts
interface CodecWithDefault<T> extends Codec<T> {
  readonly defaultValue: T
  nullable: () => CodecWithDefault<T | null>
}
```

## Codec.withDefault

Returns a variant of a codec carrying `defaultValue`. The codec's `parse` stays raw
(`undefined` when absent or invalid); the param that binds the codec resolves the
default, so it applies in one place rather than being baked into `parse`.

```ts
function withDefault<T>(defaultValue: T): CodecWithDefault<T>
```

### Parameters

- `defaultValue: T`
  - The value an absent or invalid key reads back as.

### Return value

- `codec: CodecWithDefault<T>`
  - A codec exposing `defaultValue`. Bound refs read as `T`, resolving absence to
    the default. A written value equal to the default is omitted from the URL
    ([`clearOnDefault`](/guide/query-state/navigation-options#clearondefault)).

### Usage

```ts
import { codecs } from '@vuqs/core'

codecs.integer // Codec<number>            → ref is number | undefined
codecs.integer.withDefault(1) // CodecWithDefault<number> → ref is number
```

## Codec.nullable

```ts
interface Codec<T> {
  nullable: () => Codec<T | null>
}

interface CodecWithDefault<T> extends Codec<T> {
  nullable: () => CodecWithDefault<T | null>
}
```

### Return value

- `codec: Codec<T | null> | CodecWithDefault<T | null>`
  - A new codec accepting `null`. A defaulted codec returns a
    `CodecWithDefault<T | null>` carrying the same default.
  - `serialize(null)` returns `undefined`, omitting the param from the URL. Other
    values use the original serializer.
  - `parse` is unchanged, including absence and invalid-input handling.
  - `eq` treats two `null` values as equal and `null` versus a non-null value as
    unequal. Other comparisons use the original equality function.
  - Add `.withDefault(null)` to read absence as `null`.

### Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const state = useQueryState('state', codecs.string.nullable().withDefault(null))
//    ^? QueryStateRef<string | null>

state.set('active')
state.set(null) // remove the param; state reads null
```
