# Nested & composite keys

Most params map to a flat top-level key (`?q=…`). Sometimes you want structure:
a nested object in the query, or a single logical value spread across several
keys. vuqs supports both.

## Nested keys with dot paths

A param's path can be **dotted** to target a nested query object:

```ts
import { codecs, defineQueryParam } from '@vuqs/core'

defineQueryParam('filters.sort', codecs.string)
defineQueryParam('filters.dir', codecs.literal(['asc', 'desc'] as const))
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
the object form of [`defineQueryParam`](/guide/defining-params#composite-params):

```ts
import { defineQueryParam, getQueryString } from '@vuqs/core'

interface DateRange {
  from: string
  to: string
}

const range = defineQueryParam<DateRange>({
  paths: ['from', 'to'],
  parse: (query) => {
    const from = getQueryString(query.from)
    const to = getQueryString(query.to)
    return from && to ? { from, to } : undefined
  },
  serialize: value => ({ from: value.from, to: value.to }),
})
```

Now a single param drives two keys:

```ts
const { values } = useQueryStates({ range })

values.range = { from: '2026-01-01', to: '2026-06-30' }
// ?from=2026-01-01&to=2026-06-30

values.range = undefined // clears BOTH keys
```

### `paths` is the contract

`paths` lists every key the param owns — it's the source of truth for what
"clearing" the param removes. vuqs enforces it: a dev guard runs on the first
`serialize` and **throws** if it writes a key outside `paths`:

```ts
defineQueryParam({
  paths: ['from', 'to'],
  parse: () => { /* … */ },
  serialize: value => ({ from: value.from, to: value.to, extra: 1 }),
  //                                                      ^^^^^ ❌ throws: "extra" not in declared paths
})
```

This catches a mismatch immediately, instead of letting a later clear silently
leak or miss keys.

### Optional `eq` and `default`

The object form also takes:

- `eq?: (a, b) => boolean` — custom equality (defaults to structural).
- `default?: T` — a default value, surfaced like a codec's `.withDefault()`.

```ts
defineQueryParam<DateRange>({
  paths: ['from', 'to'],
  parse: () => { /* … */ },
  serialize: () => { /* … */ },
  eq: (a, b) => a.from === b.from && a.to === b.to,
  default: { from: '', to: '' },
})
```

## When to use which

| You want… | Use |
| --- | --- |
| Several independent keys under a namespace | dotted paths, one param each |
| One value that spans multiple keys | a composite param |
| One value, one key | a [plain param](/guide/defining-params) |
| A structured value in a single key | [`codecs.json`](/guide/codecs#json) |
