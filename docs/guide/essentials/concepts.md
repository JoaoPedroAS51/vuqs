# Concepts

These concepts define how vuqs maps URL state to typed Vue state.

## Codec: a value and the URL

A **codec** maps between a query value and a typed value. It keeps `parse` (URL to
value) and `serialize` (value to URL) in one object:

```ts
interface Codec<T> {
  parse: (raw) => T | undefined
  serialize: (value: T) => ParsedQueryValue
  eq: (a: T, b: T) => boolean
  withDefault: (value: T) => CodecWithDefault<T>
}
```

A codec is **path-agnostic**: it knows how to turn a `Date` into a string and
back, but not *where* in the query that string lives. Built-in codecs cover the
common shapes, and [`createCodec`](/guide/codecs/custom) builds your own.

`parse` returns `undefined` when the key is absent **or invalid**, so a stale or
hand-edited URL degrades instead of throwing: `?page=banana` parses to
`undefined`, which falls back to the default.

## Param: a codec bound to a key

A **param** binds a codec to a concrete query path.
[`queryParam`](/guide/going-further/defining-params) builds one:

```ts
import { codecs, queryParam } from '@vuqs/core'

const page = queryParam('page', codecs.integer)
// binds codecs.integer to the `page` key
```

A param owns its keys (`paths`), so when a value is cleared, vuqs removes exactly
those keys and leaves unmanaged params untouched. Params are pure data: the same
definition works in `useQueryState`, `useQueryStates`, the
[serializer](/guide/going-further/serializer), and any [modules](/modules/)
applied to it.

`queryParam` returns a chainable **builder** (`.withDefault()`, `.transform()`,
and more), and the builder *is* a param, so it can be used directly in a schema.
Use it when the query key differs from the name you read, when you compose a
[multi-key param](/guide/going-further/defining-params#composite-params), or when
you chain a modifier. For a plain key, a bare codec is enough (see below).

## Schema: a map of params

A **schema** maps logical names to params. A bare codec is shorthand, using the
map key as the query path:

```ts
const schema = {
  q: codecs.string,
  sort: codecs.literal(['asc', 'desc'] as const),
}
```

The map key (`q`) is the name *you* read and write. Use `queryParam` when the
query key should differ from that name:

```ts
// reads `values.lat`, while the URL says ?latitude=…
const schema = {
  lat: queryParam('latitude', codecs.float),
}
```

## Default value: not the same as "empty"

`.withDefault(v)` attaches a default. On a codec (`codecs.integer.withDefault(1)`)
or on a param builder (`queryParam('page', codecs.integer).withDefault(1)`), it
changes two behaviors:

1. **Reads are non-nullable.** An absent key reads back as `v`, not `undefined`,
   so `QueryStateRef<number>` instead of `QueryStateRef<number | undefined>`.
2. **The default never reaches the URL.** When a value equals its default, vuqs
   drops the key. This is [`clearOnDefault`](/guide/essentials/navigation-options#clearondefault),
   on by default, so a "page 1 of N" view shows `/products`, not
   `/products?page=1`. Keep a default in the URL with the builder's
   [`keepOnDefault()`](/guide/going-further/defining-params).

Clearing a param means *revert to its default*, not *set to empty*.

## The commit cycle

vuqs follows a **committed** model: the URL is the single source of truth. A write
goes through the URL rather than mutating local state alongside it.

```
transaction ──▶ optimistic overlay ──▶ coalesced navigation ──▶ URL changes ──▶ reconcile
```

1. You assign `q.value = 'laptop'` (or call `.set`), creating a one-param
   **transaction**. A grouped `patch`, `replace`, or `clear` creates one transaction
   for its complete key set.
2. vuqs serializes the whole transaction, then applies it atomically to an
   **optimistic overlay** so the UI updates instantly. A module observing the write
   sees the complete transaction, never a partially applied batch.
3. Separate transactions from bindings using the same adapter and within the same
   coalescing window share one navigation. They remain separate write intents even
   when the adapter receives one combined query update.
4. The adapter navigates, and the URL changes.
5. Once the URL reflects a write, its overlay entry is **reconciled away**, and
   the URL is now authoritative. Writes the URL hasn't caught up to are kept, so
   an unrelated navigation can't discard an in-flight change.

Rapid edits stay responsive because the UI reads the overlay, and coalescing keeps
one history entry per burst of writes.

::: tip Coalescing window
By default, writes coalesce per microtask. Set
[`throttleMs`](/guide/essentials/navigation-options#throttlems) to widen the
window, which suits a search box that fires on every keystroke.
:::

## Reactive shapes: ref vs. reactive object

vuqs follows one rule for what it hands back:

- **A single value becomes a ref.** `useQueryState` returns a
  [`QueryStateRef`](/guide/essentials/use-query-state).
- **A map of values becomes a reactive object.** `useQueryStates` returns a
  reactive `values` where `values.q` *is* the value.

[Modules](/modules/) follow the same rule: one that exposes a map of values hands
back a reactive object, while one that exposes a single value hands back a ref.

::: warning Replace, don't mutate
Reactive maps track *assignment*, not in-place mutation. `values.tags = [...next]`
navigates; `values.tags.push(x)` does not. Always replace the value.
:::

## Modules

When plain URL state isn't enough, [modules](/modules/) compose extra behavior
with `.use()`, on both `useQueryStates` (a group) and `useQueryState` (one param).
They are opt-in and ship from the `@vuqs/core/modules` entry point.
