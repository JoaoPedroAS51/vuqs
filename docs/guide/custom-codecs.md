# Custom codecs

When no [built-in codec](/guide/codecs) fits, build one. A codec is a small,
self-contained object — `createCodec` is the only entry point you need.

```ts
import { createCodec } from '@vuqs/core'

const codec = createCodec<T>({
  parse: (raw): T | undefined => { /* … */ },
  serialize: (value): ParsedQueryValue => { /* … */ },
  eq: (a, b): boolean => { /* … */ },
})
```

`createCodec` gives you `parse`, `serialize`, `eq` (defaulting to structural
equality), and a `.withDefault()` — exactly like the built-ins.

## The two rules

1. **`parse` returns `undefined` for absent *or invalid* input.** Never throw.
   A bad URL should degrade to the default, not crash the page.
2. **`serialize` and `parse` must round-trip.** `parse(serialize(x))` should equal
   `x` for every valid `x`. Pairing them in one codec is what keeps that true —
   and [`@vuqs/core/testing`](/guide/testing#testing-custom-codecs) turns it into an
   assertion.

## Reading the raw value

`parse` receives a `ParsedQueryValue` — a string, number, boolean, `null`, an
array, a nested object, or `undefined`. For scalar codecs, the helper
[`getQueryString`](/api/serializer#path-helpers) normalizes that into a clean
`string | undefined`:

```ts
import { createCodec, getQueryString } from '@vuqs/core'

const upper = createCodec<string>({
  parse: (raw) => {
    const value = getQueryString(raw)
    return value === undefined ? undefined : value.toUpperCase()
  },
  serialize: value => value.toLowerCase(),
})
```

## Example: a clamped percentage

A codec that only accepts integers in `0–100`:

```ts
import { createCodec, getQueryString } from '@vuqs/core'

const percent = createCodec<number>({
  parse: (raw) => {
    const value = getQueryString(raw)
    if (value === undefined || !/^\d+$/.test(value)) {
      return undefined
    }
    const n = Number(value)
    return n >= 0 && n <= 100 ? n : undefined // out of range → absent
  },
  serialize: value => String(value),
})

const opacity = useQueryState('opacity', percent.withDefault(100))
```

## Example: adapting a library's state

The original motivation for `createCodec` is adapting an **external state shape**
to the URL — for instance a table library's sorting or pagination state. Because
a codec is just parse + serialize, you wrap the library's existing
encode/decode:

```ts
import type { SortingState } from '@tanstack/vue-table'
import { createCodec, getQueryString } from '@vuqs/core'

// Encode as `id.dir` pairs: ?sort=name.asc,price.desc
const tableSorting = createCodec<SortingState>({
  parse: (raw) => {
    const value = getQueryString(raw)
    if (!value) {
      return undefined
    }
    return value.split(',').map((part) => {
      const [id, dir] = part.split('.')
      return { id, desc: dir === 'desc' }
    })
  },
  serialize: value =>
    value.map(s => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(','),
})

const sorting = useQueryState('sort', tableSorting.withDefault([]))
//    ^? QueryStateRef<SortingState>
```

Now your table's sort order lives in the URL, fully typed, with no special
integration in vuqs.

## Custom equality

`eq` decides when a value equals its default (for [`clearOnDefault`](/guide/navigation-options#clearondefault))
and when an optimistic write has been reconciled. It defaults to a deep
structural compare, which is right for most values. Override it when structural
equality is wrong or wasteful — for example, comparing dates by timestamp:

```ts
const day = createCodec<Date>({
  parse: (raw): Date | undefined => { /* … */ },
  serialize: value => value.toISOString().slice(0, 10),
  eq: (a, b) => a.valueOf() === b.valueOf(), // two Date objects, same instant
})
```

The built-in date codecs do exactly this.

## Validating with a schema (Zod, Valibot, …)

For structured values you don't need a hand-rolled codec — [`codecs.json`](/guide/codecs#json)
already accepts a `validate` function, and a schema parser slots right in:

```ts
import { z } from 'zod'

const filters = z.object({ min: z.number(), max: z.number() })

const range = useQueryState('range', codecs.json({ validate: filters.parse }))
```

A `validate` that throws (as Zod's `.parse` does on a mismatch) is caught and
treated as absent — so an invalid URL falls back to the default, same as any other
codec.

## Reuse it

A custom codec is a plain value — export it from a module and use it across your
app, or wrap it in a named [param](/guide/defining-params):

```ts
// codecs.ts
export const percent = createCodec<number>({ /* … */ })
```
