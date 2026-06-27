# Building URLs (serializer)

Sometimes you need a URL **without navigating to it** — an `<a href>` to a
pre-filtered view, a redirect target, a canonical link, or query strings on the
server for SSR. [`createSerializer`](/api/serializer#createserializer) builds a
reusable, schema-bound function that turns values into a query.

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

It applies the **same** rules as the reactive writers — `clearOnDefault`, the
[`null`/`undefined` write protocol](/guide/null-vs-undefined) — so a built link
matches what navigating would produce.

## Patching over a base

Pass a base query as the first argument to merge values over it. Untouched managed
params **and** unmanaged params are preserved:

```ts
serialize({ page: 2 })                    // fresh: { page: '2' }
serialize(route.query, { page: 2 })       // patch: keep everything, bump page
serialize(route.query, { sort: null })    // patch: clear sort, keep the rest
```

This is the building block for "next page" links that retain the current
filters:

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

Unmanaged params on the base are **always** kept. Only params you actually mention
are affected — the serializer never injects phantom defaults for params you didn't
touch.

## String output

By default the serializer returns a query **object**, leaving the wire format to
you. Pass `stringify` to get a string instead — wiring in `qs` (or
`URLSearchParams`) at this one boundary:

```ts
import qs from 'qs'

const toUrl = createSerializer(schema, {
  stringify: query => qs.stringify(query, { addQueryPrefix: true }),
})

toUrl({ q: 'laptop', page: 2 }) // → '?q=laptop&page=2'
```

Now build hrefs directly:

```vue
<template>
  <a :href="toUrl(route.query, { sort: 'desc' })">Sort descending</a>
</template>
```

## String base

By default the base must be a query object. Pass `parse` to also accept a **string**
base — useful on the server where you start from a raw query string:

```ts
const serialize = createSerializer(schema, {
  parse: search => qs.parse(search),
  stringify: query => qs.stringify(query),
})

serialize('q=old&page=5', { page: 1 }) // start from a string, return a string
```

Passing a string base without a `parse` option throws — a clear signal you forgot
to wire it.

## SSR and loaders

Because the serializer is a pure function over a schema, it runs anywhere — no
Vue component, no router. Use it in a server route or data loader to read the
incoming query and build a canonical or redirect URL:

```ts
// A server handler that normalizes the query
const serialize = createSerializer(schema, {
  parse: qs.parse,
  stringify: q => qs.stringify(q, { addQueryPrefix: true }),
})

const canonical = serialize(request.url.split('?')[1] ?? '', {})
```

For reading values out of a query (rather than building one), pair the schema with
the pure [`parseQueryStates`](/api/serializer#pure-functions) helper.

## Related pure functions

`createSerializer` is built on a handful of pure, framework-free functions
exported for advanced use — `parseQueryStates`, `serializeQueryStates`,
`buildQuery`, `dropDefaults`, and more. See the
[API reference](/api/serializer#pure-functions).
