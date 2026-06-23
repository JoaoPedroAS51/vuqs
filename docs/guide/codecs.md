# Codecs

A **codec** converts between a typed value and its query-string form. It pairs
`parse` (URL → value) with `serialize` (value → URL) as one unit, so the two can
never disagree. vuqs ships codecs for every common shape; for anything else,
[build your own](/guide/custom-codecs).

```ts
import { codecs } from 'vuqs'

codecs.string          // a ready-made codec
codecs.arrayOf(codecs.integer) // a factory — call it to get a codec
```

## The golden rule: invalid parses to absent

Every codec's `parse` returns `undefined` when the key is **missing or invalid**.
There is no "throw on bad input" — a hostile or stale URL degrades gracefully to
the default:

```ts
const page = useQueryState('page', codecs.integer.withDefault(1))
// ?page=42      → 42
// ?page=banana  → 1   (invalid → undefined → default)
// (no ?page)    → 1   (absent  → undefined → default)
```

## Built-in codecs

### `string`

Reads a non-empty query string. Empty or whitespace-only values parse as absent.

```ts
useQueryState('q', codecs.string)              // string | undefined
useQueryState('q', codecs.string.withDefault('')) // string
```

### `integer`

A base-10 integer. Non-numeric input parses as absent; serializing truncates
toward zero.

```ts
useQueryState('page', codecs.integer.withDefault(1)) // ?page=2
```

### `float`

A floating-point number. Non-numeric or non-finite input parses as absent.

```ts
useQueryState('ratio', codecs.float) // ?ratio=1.5
```

### `boolean`

The strings `'true'` and `'false'`. Anything else parses as absent.

```ts
useQueryState('archived', codecs.boolean.withDefault(false)) // ?archived=true
```

### `index`

A 1-based index in the URL mapped to a **0-based** value in your state — ideal for
human-friendly page numbers over a zero-based array:

```ts
const page = useQueryState('page', codecs.index.withDefault(0))
// ?page=1 → 0,  ?page=2 → 1,  page.value = 2 → ?page=3
```

### `hex`

A non-negative hexadecimal integer. Serializing pads to an even length.

```ts
useQueryState('color', codecs.hex) // ?color=ff8800 → 16746496
```

### Dates

Three date codecs, differing only in their wire format. All compare by timestamp
(`valueOf`), so equality is exact.

| Codec | URL form | Example |
| --- | --- | --- |
| `timestamp` | milliseconds since epoch | `?t=1719014400000` |
| `isoDate` | `YYYY-MM-DD` (midnight UTC) | `?d=2026-06-22` |
| `isoDateTime` | full ISO-8601 | `?d=2026-06-22T10:00:00.000Z` |

```ts
const from = useQueryState('from', codecs.isoDate)
//    ^? QueryStateRef<Date | undefined>
```

Each parses as absent on invalid input.

### `arrayOf`

Wraps another codec to handle a list. A scalar query value is treated as a
single-item array; items the inner codec rejects are dropped; an empty result
parses as absent.

```ts
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
// ?tags=vue&tags=urls → ['vue', 'urls']

const ids = useQueryState('ids', codecs.arrayOf(codecs.integer))
// ?ids=1&ids=2&ids=banana → [1, 2]   (the invalid item is dropped)
```

::: tip Arrays in the URL
`arrayOf` uses repeated keys (`?tags=a&tags=b`), which requires the adapter to
parse repeated keys into an array — `qs` does this. See
[adapters](/guide/adapters#vue-router).
:::

### `literal` (string enum)

Constrains a string to a fixed set. Anything outside the set parses as absent.
Use `as const` so the value type narrows to the union.

```ts
const sort = useQueryState(
  'sort',
  codecs.literal(['asc', 'desc'] as const).withDefault('asc'),
)
//    ^? QueryStateRef<'asc' | 'desc'>
```

### `numberLiteral` (number enum)

The numeric counterpart of `literal`.

```ts
const perPage = useQueryState('perPage', codecs.numberLiteral([10, 20, 50] as const))
//    ^? QueryStateRef<10 | 20 | 50 | undefined>
```

### `json`

Encodes any JSON-serializable value. Invalid JSON parses as absent. Pass a
`validate` function — including a schema parser like Zod's `.parse` — to validate
the decoded value; a throw is caught and treated as absent.

```ts
import { z } from 'zod'

const range = z.object({ min: z.number(), max: z.number() })

const priceRange = useQueryState('price', codecs.json({ validate: range.parse }))
//    ^? QueryStateRef<{ min: number; max: number } | undefined>
// ?price=%7B%22min%22%3A0%2C%22max%22%3A99%7D → { min: 0, max: 99 }
```

::: warning Keep JSON small
JSON values are URL-encoded and can get long quickly. For a couple of fields it's
fine; for a large object, prefer several scalar keys or a
[composite field](/guide/nested-keys#composite-fields).
:::

## Defaults: `.withDefault()`

Every codec carries a `.withDefault(value)`. It changes two things, covered in
[Core concepts](/guide/concepts#default-value-not-the-same-as-empty):

```ts
codecs.string                  // QueryStateRef<string | undefined>
codecs.string.withDefault('')  // QueryStateRef<string>, and '' is dropped from the URL
```

1. Reads become **non-nullable** — an absent key returns the default.
2. The default is **omitted from the URL** (via `clearOnDefault`), keeping links clean.

## Codec summary

| Codec | Type | URL example |
| --- | --- | --- |
| `string` | `string` | `?q=laptop` |
| `integer` | `number` | `?page=2` |
| `float` | `number` | `?ratio=1.5` |
| `boolean` | `boolean` | `?archived=true` |
| `index` | `number` (0-based) | `?page=1` → `0` |
| `hex` | `number` | `?color=ff8800` |
| `timestamp` | `Date` | `?t=1719014400000` |
| `isoDate` | `Date` | `?d=2026-06-22` |
| `isoDateTime` | `Date` | `?d=2026-06-22T10:00:00Z` |
| `arrayOf(c)` | `T[]` | `?tags=a&tags=b` |
| `literal([…])` | string union | `?sort=asc` |
| `numberLiteral([…])` | number union | `?perPage=20` |
| `json({ validate? })` | `T` | `?f=%7B…%7D` |

Need something else? **[Build a custom codec →](/guide/custom-codecs)**
