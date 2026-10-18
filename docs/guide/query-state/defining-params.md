# Defining params

A **param** binds a [codec](/guide/codecs/built-in) to one or more query keys.
[`queryParam`](/api/params/query-param) builds one, and returns a chainable
**builder** that is itself a param, so it can be used directly in a schema,
`useQueryState`, or the [serializer](/guide/query-state/building-urls).

```ts
import { codecs, queryParam } from '@vuqs/core'

const page = queryParam('page', codecs.integer.withDefault(1))
```

A param is **pure data**. The same definition works everywhere a param is
accepted, and any [modules](/modules/) applied to it.

## Why name a param?

In a [schema](/guide/query-state/use-query-states), a bare codec is enough when the
name you read *is* the query key. Use `queryParam` when you want to:

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

## Reusing a schema

`defineQuerySchema` names a whole schema, normalizing its entries (a bare codec
becomes a full param) so a type derived from it stays in sync with what the
composables build. Define it once and share it:

```ts
// filters.ts
import type { QueryStateValues } from '@vuqs/core'
import { codecs, defineQuerySchema, queryParam } from '@vuqs/core'

export const filters = defineQuerySchema({
  q: codecs.string,
  status: queryParam('status', codecs.literal(['open', 'closed'] as const)),
})

export type Filters = QueryStateValues<typeof filters>
```

`useQueryStates(filters)`, [`createSerializer(filters)`](/guide/query-state/building-urls),
and `QueryStateValues<typeof filters>` all read the same normalized shape.

## Single-key params

`queryParam(path, codec)` binds a codec to `path`. With no codec it is a plain
string; `{ defaultValue }` is shorthand for a string with a default.

```ts
queryParam('currency', codecs.string) // QueryParamBuilder<string>
queryParam('page', codecs.integer.withDefault(1)) // QueryParamBuilderWithDefault<number>
queryParam('q') // a plain string param
queryParam('q', { defaultValue: '' }) // a string param with a default
```

A codec carrying `.withDefault()` produces a defaulted param. `useQueryStates`
narrows that param's read type to `T` by resolving absence to the default.

## Builder modifiers

Each modifier returns a new builder, so definitions stay immutable and the last
call for a given modifier wins.

| Modifier | Effect |
| --- | --- |
| `.withDefault(v)` | Sets the param's default, layered over the codec default. |
| `.withEquality(eq)` | Sets how explicit values compare, which drives `clearOnDefault`. |
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

### Adapter configuration

Nested params need an adapter that parses and serializes nested query objects.
The browser History API adapter supports them through dotted keys. For
`vue-router`, configure a matching parser and stringifier, for example
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

Top-level repeated-key arrays (`?tags=a&tags=b`) work with the default
`vue-router` parser. They do not require `qs`. See [Adapters](/guide/getting-started/adapters)
for the built-in adapters and their query formats.

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

A child may be a bare codec, in which case its key is the query key, so the same
map reads:

```ts
const range = queryParam.object({
  from: codecs.isoDate,
  to: codecs.isoDate,
})
```

Mix bare codecs with defined params when a child needs a distinct key or its own
modifiers, exactly as in a `useQueryStates` schema.

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

An object resolves each child against the first applicable source, highest first:

1. the explicit URL value,
2. runtime defaults,
3. the `.withDefault()` of the enclosing objects, outermost first,
4. the object's own `.withDefault()`,
5. the child's default.

`.withDefault()` takes a **partial** contribution: a defined path overrides the
sources below it, while an omitted or `undefined` path keeps them. A `null` is a
value and overrides. Repeating `.withDefault()` replaces the previous contribution
of that object instead of adding to it.

```ts
const range = queryParam.object({
  min: codecs.integer.withDefault(0),
  max: codecs.integer.withDefault(100),
}).withDefault({ min: 10 })

useQueryStates({ range }).values.range // { min: 10, max: 100 }
```

An object without explicit children resolves from its defaults. `.withDefaultsWhenPresent()`
conditions **every** default of that object on at least one child being present in
the URL, whatever the modifier order, so an absent object stays absent:

```ts
const filters = queryParam.object('filters', {
  range: queryParam.object('range', {
    min: codecs.integer.withDefault(0),
    max: codecs.integer,
  }).withDefaultsWhenPresent(),
})
const query = useQueryStates({ filters }).use(withRuntimeDefaults())

// URL: ?filters[range][max]=10
query.explicitValues.filters // { range: { max: 10 } }
query.values.filters // { range: { min: 0, max: 10 } }
```

A parent resolves as an object when a source supplies it directly, even as `{}`,
or when a child resolves a value. Candidates held only by absent gated children
do not create the parent.

### Explicit and resolved values

A composed param separates three types:

| Type | Children | Where it appears |
| --- | --- | --- |
| Explicit | Every child optional | `explicitValues`, `parseQueryStates`, writers, `eq` |
| Resolved | Children with an applicable default are required | `values`, `.value` |
| Contribution | Recursively partial through object children | `.withDefault()`, `setDefaults` |

Writers accept the explicit type, so `patch({ range: { max: 10 } })` stores only
`max` and `min` keeps resolving from its defaults. Assigning a whole object through
the `values` map keeps the resolved type, so use `patch`, `set` or a ref from
`toQueryRefs` for partial input. A JSON or transformed child is atomic and always
needs its complete value.

### Transforms and defaults

A transform maps the resolved object to a public value, so a defined input is
resolved against its static defaults before `read` runs. `read` is not called while
the input is absent. The output is atomic: its default is the mapping of the
input's static default, `.withDefault()` after `.transform()` replaces it, and
runtime defaults for the output are never passed through `read`.

An input gated with `.withDefaultsWhenPresent()` derives no output default while it
is absent.

## Definitions never collide

vuqs throws if two params in a schema declare the same query path, because their
reads and writes would silently clobber each other:

```ts
useQueryStates({
  a: queryParam('q', codecs.string),
  b: queryParam('q', codecs.integer), // ❌ throws: duplicate path "q"
})
```

## When to use which

| You want | Use |
| --- | --- |
| One value, one key, name = key | a bare codec |
| A named or reused param, a custom key, or a modifier | `queryParam(path, codec)` |
| Several independent keys under a namespace | dotted paths, one param each |
| One value that spans multiple keys | `queryParam.object(children)` |
| A structured value in a single key | [`codecs.json`](/guide/codecs/built-in#json) |
