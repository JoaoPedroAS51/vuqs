# Defining params

A **param** binds a [codec](/guide/codecs) to a concrete query key.
[`queryParam`](/api/composables#queryparam) creates one. You've seen
it inline in `useQueryStates`; this page covers it on its own — for naming,
reusing, and composing params.

```ts
import { codecs, queryParam } from '@vuqs/core'

const page = queryParam('page', codecs.integer.withDefault(1))
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
import { codecs, queryParam } from '@vuqs/core'

export const filterSchema = {
  q: queryParam('q', codecs.string.withDefault('')),
  sort: queryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: queryParam('page', codecs.integer.withDefault(1)),
}
```

```ts
// AnyComponent.vue
import { useQueryStates } from '@vuqs/core'
import { filterSchema } from './filters'

const { values } = useQueryStates(filterSchema)
```

**Decouple the name from the key.** The schema key is what *you* read; the path is
what the URL shows. They can differ:

```ts
const schema = {
  lat: queryParam('latitude', codecs.float),
  lng: queryParam('longitude', codecs.float),
}
// values.lat ⇄ ?latitude=…
```

This is vuqs's equivalent of a key alias — no separate `urlKeys` config needed.

## Single-key params

The common form: a path and a codec.

```ts
queryParam('currency', codecs.string)              // DefinedQueryParam<string>
queryParam('page', codecs.integer.withDefault(1))  // DefinedQueryParamWithDefault<number>
queryParam('filters.sort', codecs.string)          // a nested key — see below
```

A codec carrying `.withDefault()` produces a `DefinedQueryParamWithDefault`,
which is what lets `useQueryStates` narrow that param to non-nullable.

## Nested keys

A path can be dotted to target a nested query object:

```ts
queryParam('filters.sort', codecs.string)
// ⇄ ?filters[sort]=price   (with qs configured)
```

Nested keys need the adapter to parse/stringify with `qs`. See
[Nested & composite keys](/guide/nested-keys).

## Composite params

For a value that spans **multiple keys** — a date range across `from` and `to`, a
bounding box across four — use `queryParam.object`. Add `transform({ read, write })`
when the public value needs stricter semantics than the child object.

```ts
import { codecs, queryParam } from '@vuqs/core'

interface Range {
  from: string
  to: string
}

const range = queryParam.object({
  from: queryParam('from', codecs.string),
  to: queryParam('to', codecs.string),
}).transform({
  read(value): Range | undefined {
    return value.from && value.to ? { from: value.from, to: value.to } : undefined
  },
  write: value => value,
})
// values.range ⇄ ?from=2026-01-01&to=2026-06-30
```

Child params provide the owned `paths`; clearing `range` clears every child key.
See [composite params](/guide/nested-keys#composite-params) for the full walkthrough.

Object params also support `.withEquality(...)`, `.withDefault(...)`, and the
other `queryParam` modifiers.

## Definitions never collide

vuqs throws if two params in a schema declare the same query path, because their
reads and writes would silently clobber each other:

```ts
useQueryStates({
  a: queryParam('q', codecs.string),
  b: queryParam('q', codecs.integer), // ❌ throws: duplicate path "q"
})
```

This is a build-time-of-mind safety net — you find out immediately, not in
production.
