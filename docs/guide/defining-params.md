# Defining params

A **param** binds a [codec](/guide/codecs) to a concrete query key.
[`defineQueryParam`](/api/composables#definequeryParam) creates one. You've seen
it inline in `useQueryStates`; this page covers it on its own — for naming,
reusing, and composing params.

```ts
import { codecs, defineQueryParam } from 'vuqs'

const page = defineQueryParam('page', codecs.integer.withDefault(1))
```

A param is **pure data**. The same definition works everywhere a param is
accepted: [`useQueryState`](/guide/use-query-state),
[`useQueryStates`](/guide/use-query-states), the
[serializer](/guide/serializer), and any [modules](/modules/introduction) applied
to it.

## Why name a param?

Inline definitions are fine for one-off use. Pull a param out when you want to:

**Reuse it across components.** Define your filter schema once, import it
everywhere:

```ts
// filters.ts
import { codecs, defineQueryParam } from 'vuqs'

export const filterSchema = {
  q: defineQueryParam('q', codecs.string.withDefault('')),
  sort: defineQueryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryParam('page', codecs.integer.withDefault(1)),
}
```

```ts
// AnyComponent.vue
import { useQueryStates } from 'vuqs'
import { filterSchema } from './filters'

const { values } = useQueryStates(filterSchema)
```

**Decouple the name from the key.** The schema key is what *you* read; the path is
what the URL shows. They can differ:

```ts
const schema = {
  lat: defineQueryParam('latitude', codecs.float),
  lng: defineQueryParam('longitude', codecs.float),
}
// values.lat ⇄ ?latitude=…
```

This is vuqs's equivalent of a key alias — no separate `urlKeys` config needed.

## Single-key params

The common form: a path and a codec.

```ts
defineQueryParam('currency', codecs.string)              // QueryParamDefinition<string>
defineQueryParam('page', codecs.integer.withDefault(1))  // QueryParamDefinitionWithDefault<number>
defineQueryParam('filters.sort', codecs.string)          // a nested key — see below
```

A codec carrying `.withDefault()` produces a `QueryParamDefinitionWithDefault`,
which is what lets `useQueryStates` narrow that param to non-nullable.

## Nested keys

A path can be dotted to target a nested query object:

```ts
defineQueryParam('filters.sort', codecs.string)
// ⇄ ?filters[sort]=price   (with qs configured)
```

Nested keys need the adapter to parse/stringify with `qs`. See
[Nested & composite keys](/guide/nested-keys).

## Composite params

For a value that spans **multiple keys** — a date range across `from` and `to`, a
bounding box across four — use the object form. You provide `paths`, `parse`, and
`serialize` directly:

```ts
import { getQueryString } from 'vuqs'

interface Range {
  from: string
  to: string
}

const range = defineQueryParam<Range>({
  paths: ['from', 'to'],
  parse: (query) => {
    const from = getQueryString(query.from)
    const to = getQueryString(query.to)
    return from && to ? { from, to } : undefined
  },
  serialize: value => ({ from: value.from, to: value.to }),
})
// values.range ⇄ ?from=2026-01-01&to=2026-06-30
```

`paths` is the source of truth for the keys the param owns. A dev guard checks
that `serialize` never writes a key outside `paths` and throws if it does — so a
later "clear" can't leak or miss keys. See
[composite params](/guide/nested-keys#composite-params) for the full walkthrough.

The object form also accepts optional `eq` (custom equality, defaults to
structural) and `default`.

## Definitions never collide

vuqs throws if two params in a schema declare the same query path, because their
reads and writes would silently clobber each other:

```ts
useQueryStates({
  a: defineQueryParam('q', codecs.string),
  b: defineQueryParam('q', codecs.integer), // ❌ throws: duplicate path "q"
})
```

This is a build-time-of-mind safety net — you find out immediately, not in
production.
