# null vs undefined

vuqs assigns different write semantics to `null` and `undefined`.

## Partial writes

`patch` and the [serializer](/guide/going-further/serializer#write-semantics) use a
three-state input:

| Intent | Sentinel |
| --- | --- |
| Set this param | a value |
| Clear this param | `null` |
| Skip this param | omit it / `undefined` |

```ts
patch({ q: 'laptop', sort: null }) // set q, clear sort, skip page
```

## Single-param writes

`useQueryState` does not use `null`. Assign `undefined` to a nullable ref, or call
`.clear()` for any single param:

```ts
const color = useQueryState('color', codecs.literal(['red', 'blue'] as const))

color.value = 'red' // set
color.value = undefined // clear
color.clear() // clear
// color.value = null // type error
```

## Whole-state writes clear by absence or undefined

`replace` and [`toQueryRef`](/api/composables#toqueryref) assignments are
exhaustive. Params omitted or set to `undefined` are cleared. These writers do not
accept `null`:

```ts
replace({ q: 'sale' }) // set q, clear every other param
replace({ q: 'sale', page: undefined }) // set q, clear page and every omitted param
filters.value = { q: 'sale' } // set q, clear every other param
filters.value = { q: 'sale', page: undefined } // set q, clear page and every omitted param
```

## Query parsing

A parsed query can contain `null`, for example from `?flag` with no `=`. Codecs
normalize it to `undefined`, so reads return `T | undefined`:

```ts
const flag = useQueryState('flag', codecs.boolean)
// ?flag      → undefined  (null normalized away)
// (no ?flag) → undefined
// ?flag=true → true
```

## JSON persistence

`QueryStateWriteValues` treats an omitted key and explicit `undefined` as the same
skip instruction. JSON also removes properties whose value is `undefined`, while
preserving `null`. A clear instruction therefore survives JSON serialization.

## Write reference

```ts
// Single param (useQueryState)
ref.value = x // set
ref.value = undefined // clear
ref.clear() // clear

// Batch, partial (patch, serializer)
patch({ a: x }) // set a
patch({ a: null }) // clear a
patch({ /* a absent */ }) // leave a untouched
patch({ a: undefined }) // leave a untouched

// Whole-state, exhaustive (replace, toQueryRef): absence/undefined clears, no null
replace({ a: x }) // set a, clear everything else
replace({ a: undefined }) // clear a and everything else
```
