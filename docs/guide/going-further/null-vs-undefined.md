# null vs undefined

vuqs uses `null` and `undefined` for two distinct jobs. The rule is small, but
worth stating plainly because it shows up in every write path.

## The one-line summary

- **Reads are never `null`.** A param reads back `T` or `undefined`, never `null`.
- **`null` is a write-only clear command,** and only in *batch* or *standalone*
  writes where a third "leave it alone" state is needed.

## Why two sentinels

A **batch** write needs to express three different intentions per param:

| Intent | Sentinel |
| --- | --- |
| Set this param | a value |
| Clear this param | `null` |
| Don't touch this param | omit it / `undefined` |

If `undefined` meant *both* "clear" and "skip," you could not write "set `q`,
clear `sort`, leave `page` alone" in a single object. So batch writes use `null`
to clear and `undefined`/absent to skip:

```ts
patch({ q: 'laptop', sort: null })
//       set q ──┘      └── clear sort, page untouched
```

This applies to [`patch`](/guide/essentials/use-query-states#patch-partial-write)
and to the [serializer](/guide/going-further/serializer#write-semantics).

## Single params don't use null

A **single** param has no "leave it alone" state: every write is *this* param. So
`useQueryState`'s ref clears via `undefined` or `.clear()`, and **does not** accept
`null`:

```ts
const color = useQueryState('color', codecs.literal(['red', 'blue'] as const))

color.value = 'red' // set
color.value = undefined // clear
color.clear() // clear (the explicit method)
// color.value = null  // ✗ not allowed: there's no third state here
```

This keeps `.value =` and `.set()` symmetric: both take a value or `undefined`,
never `null`.

## Whole-state writes clear by absence

A whole-state write is exhaustive: `replace` (from `useQueryStates`) and
[`toQueryRef`](/api/composables#toqueryref) set every param from the object you give
them and clear the rest. Absence *is* the clear signal, so they take no `null`:

```ts
replace({ q: 'sale' }) // set q, clear every other param
filters.value = { q: 'sale' } // same, through a toQueryRef
```

`patch` is the partial counterpart: it touches only the keys you name, which is why
it alone needs `null` to tell "clear this" from "leave it alone".

## Reads always normalize away null

A raw query value can be `null` (for example `?flag` with no `=`). Codecs
normalize that to `undefined` on the way in, so your reads stay clean:

```ts
const flag = useQueryState('flag', codecs.boolean)
// ?flag      → undefined  (null normalized away)
// (no ?flag) → undefined
// ?flag=true → true
```

You will never see `null` come out of a read.

## Why null survives where undefined doesn't

There is a practical reason `null` is the clear command, rather than relying on a
key's presence or absence:

- **TypeScript erases** the difference between an explicitly-`undefined` key and an
  absent one at the type level.
- **JSON round-trips drop `undefined` keys** entirely, which matters when state
  crosses a JSON boundary, such as store persistence.

`null` is type-distinct *and* survives a JSON round-trip, so a serialized "clear
this param" instruction stays intact. That is why it earns its place as the
write-side clear sentinel.

## Cheat sheet

```ts
// Single param (useQueryState)
ref.value = x // set
ref.value = undefined // clear
ref.clear() // clear

// Batch, partial (patch, serializer)
patch({ a: x }) // set a
patch({ a: null }) // clear a
patch({ /* a absent */ }) // leave a untouched
patch({ a: undefined }) // leave a untouched (same as absent)

// Whole-state, exhaustive (replace, toQueryRef): absence clears, no null
replace({ a: x }) // set a, clear everything else
```
