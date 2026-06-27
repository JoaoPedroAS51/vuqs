# Nested & composite keys

Most params map to a flat top-level key (`?q=…`). Sometimes you want structure:
a nested object in the query, or a single logical value spread across several
keys. vuqs supports both.

## Nested keys with dot paths

A param's path can be **dotted** to target a nested query object:

```ts
import { codecs, queryParam } from '@vuqs/core'

queryParam('filters.sort', codecs.string)
queryParam('filters.dir', codecs.literal(['asc', 'desc'] as const))
// ⇄ ?filters[sort]=price&filters[dir]=asc
```

This groups related keys under a namespace in the URL, which can be cleaner than a
flat soup of params.

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

The same `qs` config also enables [array values](/guide/codecs#arrayof)
(`?tags=a&tags=b`). Without it, stick to flat top-level keys.

### Surgical removal

vuqs never globally rewrites your query. When a nested param clears, it removes
exactly its own key and **prunes only the ancestor objects it emptied** —
unmanaged siblings, even empty ones, are left untouched. Clearing
`filters.sort` won't disturb `filters.dir`, and won't drop an unrelated
`?other=…`.

## Composite params

A composite param maps **one logical value to several keys**. The classic case is
a range — a `from`/`to` pair you want to read and write as a single object. Use
the object form of [`queryParam`](/guide/defining-params#composite-params):

```ts
import { codecs, queryParam } from '@vuqs/core'

interface DateRange {
  from: string
  to: string
}

const range = queryParam.object({
  from: queryParam('from', codecs.string),
  to: queryParam('to', codecs.string),
}).transform({
  read(value): DateRange | undefined {
    return value.from && value.to ? { from: value.from, to: value.to } : undefined
  },
  write: value => value,
})
```

Now a single param drives two keys:

```ts
const { values } = useQueryStates({ range })

values.range = { from: '2026-01-01', to: '2026-06-30' }
// ?from=2026-01-01&to=2026-06-30

values.range = undefined // clears BOTH keys
```

### Child paths are the contract

Each child param declares the path it owns. The object param derives its managed
paths from those children, so a later clear removes the complete composed value
without requiring a manual path list.

### Equality and defaults

Object params support the same modifiers as scalar params:

- `.withEquality((a, b) => boolean)` — custom equality.
- `.withDefault(value)` — a default value for the composed param.
- `.withDefaultsWhenPresent()` — child defaults apply only when the object is present.
- `.keepOnDefault()` — keep default values in the URL for this param.

```ts
const range = queryParam.object({
  from: queryParam('from', codecs.string),
  to: queryParam('to', codecs.string),
})
  .withEquality((a, b) => a.from === b.from && a.to === b.to)
  .withDefault({ from: '', to: '' })
```

## When to use which

| You want… | Use |
| --- | --- |
| Several independent keys under a namespace | dotted paths, one param each |
| One value that spans multiple keys | a composite param |
| One value, one key | a [plain param](/guide/defining-params) |
| A structured value in a single key | [`codecs.json`](/guide/codecs#json) |
