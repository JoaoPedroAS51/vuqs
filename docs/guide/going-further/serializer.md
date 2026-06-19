# Building URLs

Sometimes you need a URL **without navigating to it**: an `<a href>` to a
pre-filtered view, a redirect target, or a canonical link.
[`createSerializer`](/api/serializer#createserializer) builds a reusable,
schema-bound function that turns values into a query.

```ts
import { codecs, createSerializer, queryParam } from '@vuqs/core'

const schema = {
  q: queryParam('q', codecs.string.withDefault('')),
  page: queryParam('page', codecs.integer.withDefault(1)),
  sort: queryParam('sort', codecs.literal(['asc', 'desc'] as const)),
}

const serialize = createSerializer(schema)

serialize({ q: 'laptop', page: 2 })
// → { q: 'laptop', page: '2' }
```

It applies the **same** rules as the reactive writers (`clearOnDefault`, the
[`null`/`undefined` write protocol](/guide/going-further/null-vs-undefined)), so a
built link matches what navigating would produce.

## Patching over a base

Pass a base query as the first argument to merge values over it. Untouched managed
params **and** unmanaged params are preserved:

```ts
serialize({ page: 2 }) // fresh: { page: '2' }
serialize(route.query, { page: 2 }) // patch: keep everything, bump page
serialize(route.query, { sort: null }) // patch: clear sort, keep the rest
```

Passing the current query as the base preserves its filters:

```ts
const nextPageQuery = serialize(route.query, { page: currentPage + 1 })
```

## Write semantics

The values argument follows the three-state protocol:

| In `values` | Effect |
| --- | --- |
| omitted / `undefined` | leave the param untouched |
| `null` | clear the param |
| a value | set it (dropped if it equals the default, unless `clearOnDefault: false`) |

Unmanaged params on the base are kept. Only params included in `values` are
affected: the serializer never injects defaults for params you did not touch.

## String output

By default the serializer returns a query **object**, leaving the wire format to
you. Pass `stringify` to get a string with `qs`, `URLSearchParams`, or another
serializer:

```ts
import qs from 'qs'

const toUrl = createSerializer(schema, {
  stringify: query => qs.stringify(query, { addQueryPrefix: true }),
})

toUrl({ q: 'laptop', page: 2 }) // → '?q=laptop&page=2'
```

Use the serializer in an `href`:

```vue
<template>
  <a :href="toUrl(route.query, { sort: 'desc' })">Sort descending</a>
</template>
```

## String base

By default the base must be a query object. Pass `parse` to also accept a
**string** base, useful when you start from a raw query string:

```ts
const serialize = createSerializer(schema, {
  parse: search => qs.parse(search),
  stringify: query => qs.stringify(query),
})

serialize('q=old&page=5', { page: 1 }) // start from a string, return a string
```

Passing a string base without a `parse` option throws.

## Related pure functions

`createSerializer` uses the exported pure functions in the
[API reference](/api/serializer#pure-functions). To read values from a query, pass
the schema and query to `parseQueryStates`.
