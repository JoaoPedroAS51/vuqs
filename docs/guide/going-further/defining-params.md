# Defining params

A **param** binds a [codec](/guide/codecs/built-in) to one or more query keys.
[`queryParam`](/api/composables#queryparam) builds one, and returns a chainable
**builder** that is itself a param, so it drops straight into a schema,
`useQueryState`, or the [serializer](/guide/going-further/serializer).

```ts
import { codecs, queryParam } from '@vuqs/core'

const page = queryParam('page', codecs.integer.withDefault(1))
```

A param is **pure data**. The same definition works everywhere a param is
accepted, and any [modules](/modules/) applied to it.

## Why name a param?

In a [schema](/guide/essentials/use-query-states), a bare codec is enough when the
name you read *is* the query key. Reach for `queryParam` when you want to:

**Reuse a param across components.** Define it once, import it everywhere:

```ts
// params.ts
export const page = queryParam('page', codecs.integer.withDefault(1))
```

**Decouple the name from the key.** The map key is what *you* read; the path is
what the URL shows. They can differ:

```ts
const schema = {
  lat: queryParam('latitude', codecs.float),
  lng: queryParam('longitude', codecs.float),
}
// values.lat ⇄ ?latitude=…
```

## Single-key params

`queryParam(path, codec)` binds a codec to `path`. With no codec it is a plain
string; `{ defaultValue }` is shorthand for a string with a default.

```ts
queryParam('currency', codecs.string) // QueryParamBuilder<string>
queryParam('page', codecs.integer.withDefault(1)) // QueryParamBuilderWithDefault<number>
queryParam('q') // a plain string param
queryParam('q', { defaultValue: '' }) // a string param with a default
```

A codec carrying `.withDefault()` produces a defaulted param, which is what lets
`useQueryStates` narrow that param to non-nullable.

## Builder modifiers

Each modifier returns a new builder, so definitions stay immutable and the last
call for a given modifier wins.

| Modifier | Effect |
| --- | --- |
| `.withDefault(v)` | Sets the param's default, layered over the codec default. |
| `.withEquality(eq)` | Sets how values compare, which drives `clearOnDefault`. |
| `.keepOnDefault()` | Keeps a default-valued write in the URL (param-level `clearOnDefault: false`). |
| `.transform({ read, write, eq? })` | Maps the param to a different public shape. |

`.transform()` adapts a param's value to a richer shape, deriving its default and
equality from the source unless you override them. `read` returns `undefined` to
expose the value as absent:

```ts
// Store a CSV string in the URL, read it as an array.
const tags = queryParam('tags', codecs.string).transform<string[]>({
  read: value => (value ? value.split(',') : undefined),
  write: value => value.join(','),
})
```

## Nested keys

A path can be **dotted** to target a nested query object:

```ts
queryParam('filters.sort', codecs.string)
queryParam('filters.dir', codecs.literal(['asc', 'desc'] as const))
// ⇄ ?filters[sort]=price&filters[dir]=asc
```

### Requires qs

Dotted keys only round-trip if the **adapter** parses and stringifies nested
structure. `vue-router`'s default parser is flat, so configure it with
[`qs`](https://github.com/ljharb/qs):

```ts
import qs from 'qs'
import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [/* … */],
  parseQuery: qs.parse as never,
  stringifyQuery: qs.stringify as never,
})
```

The same `qs` config also enables [array values](/guide/codecs/built-in#arrays)
(`?tags=a&tags=b`). Without it, stick to flat top-level keys.

### Surgical removal

vuqs never globally rewrites your query. When a nested param clears, it removes
exactly its own key and **prunes only the ancestor objects it emptied**. Unmanaged
siblings, even empty ones, are left untouched: clearing `filters.sort` will not
disturb `filters.dir`, and will not drop an unrelated `?other=…`.

## Composite params

A composite param maps **one logical value to several keys**.
`queryParam.object` composes it from child params, merging their values into one
object:

```ts
const range = queryParam.object({
  from: queryParam('from', codecs.isoDate),
  to: queryParam('to', codecs.isoDate),
})
```

Now a single param drives two keys:

```ts
const { values } = useQueryStates({ range })

values.range = { from: new Date('2026-01-01'), to: new Date('2026-06-30') }
// ?from=2026-01-01&to=2026-06-30

values.range = undefined // clears BOTH keys
```

### Prefixing

Pass a prefix to namespace every child key under it, or to reuse an existing
param or object under a new prefix:

```ts
// Prefix each child key: ?filters[sort]=…&filters[dir]=…
queryParam.object('filters', {
  sort: queryParam('sort', codecs.string),
  dir: queryParam('dir', codecs.literal(['asc', 'desc'] as const)),
})

// Reuse `range` under a prefix, keeping its own semantics.
queryParam.object('created', range)
```

### Defaults on an object param

`.withDefault()` on an object param takes a **partial** fill, layered under the
child defaults. By default, a child default resolves the object even when the URL
holds none of its keys. `.withDefaultsWhenPresent()` gates the child defaults on
the object being present in the URL (or carrying its own default), so an absent
object stays absent instead of materializing from child defaults.

## Definitions never collide

vuqs throws if two params in a schema declare the same query path, because their
reads and writes would silently clobber each other:

```ts
useQueryStates({
  a: queryParam('q', codecs.string),
  b: queryParam('q', codecs.integer), // ❌ throws: duplicate path "q"
})
```

You find out immediately, not in production.

## When to use which

| You want | Use |
| --- | --- |
| One value, one key, name = key | a bare codec |
| A named or reused param, a custom key, or a modifier | `queryParam(path, codec)` |
| Several independent keys under a namespace | dotted paths, one param each |
| One value that spans multiple keys | `queryParam.object(children)` |
| A structured value in a single key | [`codecs.json`](/guide/codecs/built-in#json) |
