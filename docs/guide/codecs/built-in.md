# Built-in codecs

A **codec** converts between a parsed query value and a typed value. It pairs
`parse` (query to value) with `serialize` (value to query) in one object. vuqs ships
codecs for the common shapes; for anything else,
[build your own](/guide/codecs/custom).

```ts
import { codecs } from '@vuqs/core'

codecs.string // a ready-made codec
codecs.arrayOf(codecs.integer) // a factory: call it to get a codec
```

## Parsed query values

Numeric and boolean codecs accept native values returned by the adapter, applying
their validation and transformations directly. String codecs, string literals,
and ISO date codecs require text. Scalar codecs consider the first array item;
`arrayOf` processes each item and `json` reads the complete value.

```ts
codecs.integer.parse(42) // 42
codecs.boolean.parse(false) // false
codecs.index.parse(1) // 0
codecs.arrayOf(codecs.integer).parse([1, '2']) // [1, 2]
codecs.json<{ id: number }>().parse({ id: 1 }) // { id: 1 }
```

## Invalid input parses as absent

Every codec's `parse` returns `undefined` when the key is **missing or invalid**.
No codec throws on bad input: a stale or hand-edited URL degrades to the default.

```ts
const page = useQueryState('page', codecs.integer.withDefault(1))
// ?page=42      → 42
// ?page=banana  → 1   (invalid → undefined → default)
// (no ?page)    → 1   (absent  → undefined → default)
```

## String

Reads a non-empty query string. Empty or whitespace-only values parse as absent.

```ts
useQueryState('q', codecs.string) // string | undefined
useQueryState('q', codecs.string.withDefault('')) // string
```

## Numbers

### Integer

Reads an integer from a number or base-10 string. Fractional, non-numeric, and
non-finite input parses as absent; serializing truncates toward zero.

```ts
useQueryState('page', codecs.integer.withDefault(1)) // ?page=2
```

### Float

Reads a finite number from a number or numeric string. Invalid input parses as absent.

```ts
useQueryState('ratio', codecs.float) // ?ratio=1.5
```

### Hex

A non-negative hexadecimal integer. Serializing pads to an even length.
Numeric query values retain hexadecimal interpretation through their decimal
text: `codecs.hex.parse(10)` and `codecs.hex.parse('10')` both return `16`.

```ts
useQueryState('color', codecs.hex) // ?color=ff8800 → 16746496
```

### Index

A 1-based index in the URL mapped to a **0-based** value in your state, ideal for
human-friendly page numbers over a zero-based array:

```ts
const page = useQueryState('page', codecs.index.withDefault(0))
// ?page=1 → 0,  ?page=2 → 1,  page.value = 2 → ?page=3
```

## Boolean

Reads booleans or the strings `'true'` and `'false'`. Anything else parses as absent.

```ts
useQueryState('archived', codecs.boolean.withDefault(false)) // ?archived=true
```

## Literals

### String literal

Constrains a string to a fixed set. Anything outside the set parses as absent.
Use `as const` so the value type narrows to the union.

```ts
const sort = useQueryState(
  'sort',
  codecs.literal(['asc', 'desc'] as const).withDefault('asc'),
)
//    ^? QueryStateRef<'asc' | 'desc'>
```

### Numeric literal

The numeric counterpart of `literal`.

```ts
const perPage = useQueryState('perPage', codecs.numberLiteral([10, 20, 50] as const))
//    ^? QueryStateRef<10 | 20 | 50 | undefined>
```

## Enums

Constrains a value to the members of a TypeScript `enum`. Pass the enum itself:
unlike `literal`, you never restate the values or wrap them in `Object.values`,
and the value type is inferred from the enum.

```ts
enum Status {
  Active = 'active',
  Archived = 'archived',
}

const status = useQueryState('status', codecs.enum(Status).withDefault(Status.Active))
//    ^? QueryStateRef<Status>
// ?status=archived → Status.Archived
```

It also accepts numeric and heterogeneous enums. A numeric member round-trips
through its number, not its name (`Level.High` ⇄ `?level=2`), and anything outside
the enum parses as absent. Native numbers match numeric members; they are not
converted into string members.

```ts
enum Level {
  Low,
  Medium,
  High,
}

useQueryState('level', codecs.enum(Level)) // ?level=2 → Level.High
```

::: tip Fixed set without an enum
For an inline set of strings or numbers, use
[`literal`](#string-literal)/[`numberLiteral`](#numeric-literal). A plain
`as const` object works with `enum` too, narrowing to its value union.
:::

## Dates & timestamps

Three date codecs return a `Date`, differing only in their wire format. All
compare by timestamp (`valueOf`), so equality is exact, and each parses as absent
on invalid input.

| Codec | URL form | Example |
| --- | --- | --- |
| `isoDateTime` | full ISO-8601 | `?d=2026-06-22T10:00:00.000Z` |
| `isoDate` | `YYYY-MM-DD` (midnight UTC) | `?d=2026-06-22` |
| `timestamp` | milliseconds since epoch | `?t=1719014400000` |

```ts
const from = useQueryState('from', codecs.isoDate)
//    ^? QueryStateRef<Date | undefined>
```

## Arrays

`arrayOf` wraps another codec to handle a list. A scalar query value is treated
as a single-item array, items the inner codec rejects are dropped, and an empty
result parses as absent.

```ts
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
// ?tags=vue&tags=urls → ['vue', 'urls']

const ids = useQueryState('ids', codecs.arrayOf(codecs.integer))
// ?ids=1&ids=2&ids=banana → [1, 2]   (the invalid item is dropped)
```

::: tip Arrays in the URL
`arrayOf` uses repeated keys (`?tags=a&tags=b`), which the default `vue-router`
parser and the browser History API adapter parse into an array. For nested
objects, see
[Adapters](/guide/getting-started/adapters).
:::

## JSON

Reads JSON text or an already-parsed query value and serializes with
`JSON.stringify`. Objects and arrays are read in full, including empty structures.
Nullish query nodes, non-finite numeric nodes, and invalid JSON text parse as absent.

The text `"null"` decodes to the JSON value `null`. Declare it in `T` when needed,
for example `codecs.json<{ id: number } | null>()`. A native `null` query node
parses as absent.

Pass a callback or a synchronous [Standard Schema](https://standardschema.dev/schema)
as `validate`. It receives the complete decoded or already-parsed value once.
The callback return value or schema output is the codec result. Validation issues
and throws parse as absent. Without `validate`, the value is accepted as `T`
without schema validation.

```ts
import { z } from 'zod'
import { codecs, useQueryState } from '@vuqs/core'

const range = z.object({ min: z.number(), max: z.number() })

const priceRange = useQueryState('price', codecs.json({ validate: range }))
//    ^? QueryStateRef<{ min: number, max: number } | undefined>
// ?price=%7B%22min%22%3A0%2C%22max%22%3A99%7D → { min: 0, max: 99 }
```

Callbacks such as `range.parse` remain supported. The codec's `parse` throws
`TypeError` when a Standard Schema returns a Promise. The schema output
must remain serializable and be accepted on the next read. For transformations
that require an inverse mapping, use a [custom codec](/guide/codecs/custom).

Use `arrayOf(json())` for repeated JSON documents. `json()` treats an incoming
array as the JSON value itself:

```ts
const raw = ['{"id":1}', '{"id":2}']

codecs.json<string[]>().parse(raw) // ['{"id":1}', '{"id":2}']
codecs.arrayOf(codecs.json<{ id: number }>()).parse(raw) // [{ id: 1 }, { id: 2 }]
```

::: warning Keep JSON small
JSON values are URL-encoded and can grow long quickly. For a couple of params it
is fine; for a large object, prefer several scalar keys or a
[composite param](/guide/going-further/defining-params#composite-params).
:::

## Defaults: `.withDefault()`

Every codec carries a `.withDefault(value)`. It changes two things, covered in
[Concepts](/guide/essentials/concepts#default-value-not-the-same-as-empty):

```ts
codecs.string // QueryStateRef<string | undefined>
codecs.string.withDefault('') // QueryStateRef<string>, and '' is dropped from the URL
```

1. Reads become `T`: an absent key returns the default.
2. The default is **omitted from the URL** via `clearOnDefault`.

## Nullable writes: `.nullable()`

`.nullable()` returns a codec that accepts `null` and serializes it as absence.
Parsing stays unchanged. Without a default, an absent param still reads as
`undefined`; use `.withDefault(null)` when the empty state should be `null`:

```ts
const state = useQueryState('state', codecs.string.nullable().withDefault(null))
//    ^? QueryStateRef<string | null>

state.set(null) // remove the param; state reads null
```

The modifier preserves an existing default in either order:

```ts
codecs.integer.withDefault(1).nullable()
codecs.integer.nullable().withDefault(1)
```

It also works with factory and custom codecs. On a JSON codec, nullable writes
omit `null` instead of encoding the text `"null"`.

## Summary

| Codec | Type | URL example |
| --- | --- | --- |
| `string` | `string` | `?q=laptop` |
| `integer` | `number` | `?page=2` |
| `float` | `number` | `?ratio=1.5` |
| `hex` | `number` | `?color=ff8800` |
| `index` | `number` (0-based) | `?page=1` → `0` |
| `boolean` | `boolean` | `?archived=true` |
| `literal([…])` | string union | `?sort=asc` |
| `numberLiteral([…])` | number union | `?perPage=20` |
| `enum(E)` | enum members | `?status=archived` |
| `isoDateTime` | `Date` | `?d=2026-06-22T10:00:00Z` |
| `isoDate` | `Date` | `?d=2026-06-22` |
| `timestamp` | `Date` | `?t=1719014400000` |
| `arrayOf(c)` | `T[]` | `?tags=a&tags=b` |
| `json({ validate? })` | `T` | `?f=%7B…%7D` |

For a type not covered here, [build a custom codec](/guide/codecs/custom).
