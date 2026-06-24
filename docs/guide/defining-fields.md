# Defining fields

A **field** binds a [codec](/guide/codecs) to a concrete query key.
[`defineQueryState`](/api/composables#definequerystate) creates one. You've seen
it inline in `useQueryStates`; this page covers it on its own — for naming,
reusing, and composing fields.

```ts
import { codecs, defineQueryState } from 'vuqs'

const page = defineQueryState('page', codecs.integer.withDefault(1))
```

A field is **pure data**. The same definition works everywhere a field is
accepted: [`useQueryState`](/guide/use-query-state),
[`useQueryStates`](/guide/use-query-states), the
[serializer](/guide/serializer), and any [modules](/modules/introduction) applied
to it.

## Why name a field?

Inline definitions are fine for one-off use. Pull a field out when you want to:

**Reuse it across components.** Define your filter schema once, import it
everywhere:

```ts
// filters.ts
import { codecs, defineQueryState } from 'vuqs'

export const filterSchema = {
  q: defineQueryState('q', codecs.string.withDefault('')),
  sort: defineQueryState('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryState('page', codecs.integer.withDefault(1)),
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
  lat: defineQueryState('latitude', codecs.float),
  lng: defineQueryState('longitude', codecs.float),
}
// values.lat ⇄ ?latitude=…
```

This is vuqs's equivalent of a key alias — no separate `urlKeys` config needed.

## Single-key fields

The common form: a path and a codec.

```ts
defineQueryState('currency', codecs.string)              // QueryStateDefinition<string>
defineQueryState('page', codecs.integer.withDefault(1))  // QueryStateDefinitionWithDefault<number>
defineQueryState('filters.sort', codecs.string)          // a nested key — see below
```

A codec carrying `.withDefault()` produces a `QueryStateDefinitionWithDefault`,
which is what lets `useQueryStates` narrow that field to non-nullable.

## Nested keys

A path can be dotted to target a nested query object:

```ts
defineQueryState('filters.sort', codecs.string)
// ⇄ ?filters[sort]=price   (with qs configured)
```

Nested keys need the adapter to parse/stringify with `qs`. See
[Nested & composite keys](/guide/nested-keys).

## Composite fields

For a value that spans **multiple keys** — a date range across `from` and `to`, a
bounding box across four — use the object form. You provide `paths`, `parse`, and
`serialize` directly:

```ts
import { getQueryString } from 'vuqs'

interface Range {
  from: string
  to: string
}

const range = defineQueryState<Range>({
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

`paths` is the source of truth for the keys the field owns. A dev guard checks
that `serialize` never writes a key outside `paths` and throws if it does — so a
later "clear" can't leak or miss keys. See
[composite fields](/guide/nested-keys#composite-fields) for the full walkthrough.

The object form also accepts optional `eq` (custom equality, defaults to
structural) and `default`.

## Definitions never collide

vuqs throws if two fields in a schema declare the same query path, because their
reads and writes would silently clobber each other:

```ts
useQueryStates({
  a: defineQueryState('q', codecs.string),
  b: defineQueryState('q', codecs.integer), // ❌ throws: duplicate path "q"
})
```

This is a build-time-of-mind safety net — you find out immediately, not in
production.
