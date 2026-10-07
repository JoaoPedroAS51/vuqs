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

[`@vuqs/core/testing`](/guide/testing#testing-custom-codecs) asserts
both round-trip directions.

## Reading the raw value

`parse` receives a `ParsedQueryValue` (a string, number, boolean, `null`, an
array, a nested object, or `undefined`). Validate the representations your codec
accepts in `parse`.

[`getQueryString`](/api/utils/get-path) reads non-empty text from a string
or the first array item. It does not convert numbers, booleans, or objects:

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
    const input = Array.isArray(raw) ? raw[0] : raw
    let value: number

    if (typeof input === 'number') {
      value = input
    }
    else {
      const text = getQueryString(raw)
      if (text === undefined || !/^\d+$/.test(text)) {
        return undefined
      }
      value = Number(text)
    }

    return Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined
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
[`clearOnDefault`](/guide/query-state/navigation-options#clearondefault)) and when
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
callback or a synchronous Standard Schema:

```ts
import { z } from 'zod'
import { codecs, useQueryState } from '@vuqs/core'

const filters = z.object({ min: z.number(), max: z.number() })

const range = useQueryState('range', codecs.json({ validate: filters }))
```

Callbacks such as `filters.parse` remain supported. Validation issues and throws
are treated as absent. The codec's `parse` throws `TypeError` when a Standard
Schema returns a Promise.
Schema output must round-trip through JSON serialization and validation.

## Reusing a custom codec

A custom codec is a plain value: export it from a module and use it across your
app, or wrap it in a named [param](/guide/query-state/defining-params):

```ts
// codecs.ts
export const percent = createCodec<number>({ /* … */ })
```
