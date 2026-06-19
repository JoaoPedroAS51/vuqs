# Custom codecs

Use `createCodec` when no [built-in codec](/guide/codecs/built-in) fits.

```ts
import { createCodec } from '@vuqs/core'

const codec = createCodec<T>({
  parse: (raw): T | undefined => { /* … */ },
  serialize: (value): ParsedQueryValue => { /* … */ },
  eq: (a, b): boolean => { /* … */ },
})
```

`createCodec` returns `parse`, `serialize`, `eq` (defaulting to structural
equality), and a `.withDefault()`, exactly like the built-ins.

## The two rules

1. **`parse` returns `undefined` for absent *or invalid* input.** Never throw. A
   bad URL should degrade to the default, not crash the page.
2. **`serialize` and `parse` must round-trip.** `parse(serialize(x))` should equal
   `x` for every valid `x`.

[`@vuqs/core/testing`](/guide/going-further/testing#testing-custom-codecs) asserts
both round-trip directions.

## Reading the raw value

`parse` receives a `ParsedQueryValue` (a string, number, boolean, `null`, an
array, a nested object, or `undefined`). For scalar codecs, the helper
[`getQueryString`](/api/serializer#path-helpers) normalizes that into a
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

`createCodec` can adapt an **external state shape** to the URL, for instance a
table library's sorting or pagination state. Wrap the library's existing
encode/decode in `parse` and `serialize`:

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

The sort order now lives in the URL, typed, and vuqs needs no table-specific
support.

## Custom equality

`eq` decides when a value equals its default (for
[`clearOnDefault`](/guide/essentials/navigation-options#clearondefault)) and when
an optimistic write has been reconciled. It defaults to a deep structural compare,
which compares primitives with `Object.is` and recursively compares arrays and
plain objects. Override it for other value shapes or when structural comparison
is wasteful, for example comparing dates by timestamp:

```ts
const day = createCodec<Date>({
  parse: (raw): Date | undefined => { /* … */ },
  serialize: value => value.toISOString().slice(0, 10),
  eq: (a, b) => a.valueOf() === b.valueOf(), // two Date objects, same instant
})
```

The built-in date codecs do exactly this.

## Validating with a schema (Zod, Valibot, …)

For structured values you don't need a hand-rolled codec.
[`codecs.json`](/guide/codecs/built-in#json) already accepts a `validate`
function, and a schema parser can be passed directly:

```ts
import { z } from 'zod'

const filters = z.object({ min: z.number(), max: z.number() })

const range = useQueryState('range', codecs.json({ validate: filters.parse }))
```

A `validate` that throws (as Zod's `.parse` does on a mismatch) is caught and
treated as absent, so an invalid URL falls back to the default, same as any other
codec.

## Reusing a custom codec

A custom codec is a plain value: export it from a module and use it across your
app, or wrap it in a named [param](/guide/going-further/defining-params):

```ts
// codecs.ts
export const percent = createCodec<number>({ /* … */ })
```
