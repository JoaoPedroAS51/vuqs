# null vs undefined

vuqs uses `null` and `undefined` for two distinct jobs. The rule is small, but
worth stating plainly because it shows up in every write path.

## The one-line summary

- **Reads are never `null`.** A field reads back `T` or `undefined` — never `null`.
- **`null` is a write-only clear command,** and only in *batch* / *standalone*
  writes where a third "leave it alone" state is needed.

## Why two sentinels

A **batch** write needs to express three different intentions per field:

| Intent | Sentinel |
| --- | --- |
| Set this field | a value |
| Clear this field | `null` |
| Don't touch this field | omit it / `undefined` |

If `undefined` meant *both* "clear" and "skip," you couldn't write "set `q`,
clear `sort`, leave `page` alone" in a single object. So batch writes use `null`
to clear and `undefined`/absent to skip:

```ts
setValues({ q: 'laptop', sort: null })
//          set q ──┘      └── clear sort, page untouched
```

This applies to [`setValues`](/guide/use-query-states#setvalues) and to the
[serializer](/guide/serializer#write-semantics).

## Single fields don't use null

A **single** field has no "leave it alone" state — every write is *this* field. So
`useQueryState`'s ref clears via `undefined` or `.clear()`, and **does not** accept
`null`:

```ts
const color = useQueryState('color', codecs.literal(['red', 'blue'] as const))

color.value = 'red'       // set
color.value = undefined   // clear
color.clear()             // clear (the explicit method)
// color.value = null     // ✗ not allowed — there's no third state here
```

This keeps `.value =` and `.set()` symmetric: both take a value or `undefined`,
never `null`.

## Reads always normalize away null

A raw query value can be `null` (e.g. `?flag` with no `=`). Codecs normalize that
to `undefined` on the way in, so your reads stay clean:

```ts
const flag = useQueryState('flag', codecs.boolean)
// ?flag      → undefined  (null normalized away)
// (no ?flag) → undefined
// ?flag=true → true
```

You'll never see `null` come out of a read.

## Why null survives where undefined doesn't

There's a practical reason `null` is the clear command and not, say, key-presence
(`'k' in obj`):

- **TypeScript erases** the difference between an explicitly-`undefined` key and an
  absent one at the type level.
- **JSON round-trips drop `undefined` keys** entirely (relevant for SSR state
  serialization, Pinia persistence, etc.).

`null` is type-distinct *and* survives a JSON round-trip, so a serialized
"clear this field" instruction stays intact across the wire. That's why it earns
its place as the write-side clear sentinel.

## Cheat sheet

```ts
// Single field (useQueryState)
ref.value = x          // set
ref.value = undefined  // clear
ref.clear()            // clear

// Batch (setValues, serializer)
setValues({ a: x })           // set a
setValues({ a: null })        // clear a
setValues({ /* a absent */ }) // leave a untouched
setValues({ a: undefined })   // leave a untouched (same as absent)
```
