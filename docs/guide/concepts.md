# Core concepts

A short tour of the ideas vuqs is built on. You can use the library without
reading this, but it makes the API feel obvious rather than arbitrary.

## Codec: a value ⇄ the URL

A **codec** is the atom of vuqs. It pairs a `parse` (URL → value) with a
`serialize` (value → URL) so the two can never drift apart:

```ts
interface Codec<T> {
  parse: (raw) => T | undefined
  serialize: (value: T) => /* query value */
  eq: (a: T, b: T) => boolean
  withDefault: (value: T) => CodecWithDefault<T>
}
```

A codec is **path-agnostic** — it knows how to turn a `Date` into a string and
back, but not *where* in the query that string lives. Built-in codecs cover the
common shapes ([`codecs.string`](/guide/codecs#string), `integer`, `boolean`,
`isoDate`, `arrayOf`, `literal`, `json`, …), and [`createCodec`](/guide/custom-codecs)
builds your own.

`parse` returns `undefined` when the key is absent **or invalid**. That single
rule is why a garbage URL never crashes your app: `?page=banana` parses to
`undefined`, which falls back to the default.

## Param: a codec bound to a key

A **param** is a codec wired to a concrete query path, produced by
[`defineQueryParam`](/guide/defining-params):

```ts
import { codecs, defineQueryParam } from 'vuqs'

const page = defineQueryParam('page', codecs.integer)
//    binds codecs.integer to the `page` key
```

The param owns its key (`paths`), so when a value is cleared, vuqs removes exactly
that key and leaves unmanaged params untouched. Params are pure data — the same
definition works in `useQueryState`, `useQueryStates`, the
[serializer](/guide/serializer), and any [modules](/modules/introduction) applied
to it.

When you call `useQueryState('page', codecs.integer)`, vuqs creates the param for
you. `defineQueryParam` is for when you want to name and reuse a param, or build a
[composite one](/guide/nested-keys#composite-params).

## Schema: a map of params

A **schema** is just an object mapping logical names to params:

```ts
const schema = {
  q: defineQueryParam('q', codecs.string),
  sort: defineQueryParam('sort', codecs.literal(['asc', 'desc'] as const)),
}
```

The map key (`q`) is the name *you* read and write. The query key it controls
lives inside the param. They're usually the same, but they don't have to be —
`{ lat: defineQueryParam('latitude', codecs.float) }` reads `values.lat` while the
URL says `?latitude=…`.

## Default value: not the same as "empty"

`.withDefault(v)` attaches a default to a codec. It changes two behaviors:

1. **Reads are non-nullable.** An absent key reads back as `v`, not `undefined`,
   so `QueryStateRef<string>` instead of `QueryStateRef<string | undefined>`.
2. **The default never reaches the URL.** When a value equals its default, vuqs
   drops the key (this is [`clearOnDefault`](/guide/navigation-options#clearondefault),
   on by default). So a "page 1 of N" view shows a clean `/products`, not
   `/products?page=1`.

Clearing a param means *revert to its default*, not *set to empty*.

## The commit cycle

vuqs follows a **committed** model: the URL is the single source of truth. A write
doesn't mutate local state and hope the URL catches up — it goes through the URL.

```
write ──▶ optimistic overlay ──▶ navigate ──▶ URL changes ──▶ reconcile
```

1. You assign `q.value = 'laptop'` (or call `.set`).
2. vuqs records it in an **optimistic overlay** so the UI updates instantly.
3. Writes within the same tick **coalesce** into one navigation.
4. The adapter navigates; the URL changes.
5. Once the URL reflects the write, the overlay entry is **reconciled away** — the
   URL is now authoritative. Writes the URL hasn't caught up to are kept, so an
   unrelated navigation can't discard an in-flight change.

The practical upshot: rapid edits feel instant, the history stays clean, and you
never see a flicker between "I typed it" and "the URL agrees."

::: tip Coalescing window
By default writes coalesce per microtask. Set
[`throttleMs`](/guide/navigation-options#throttlems) to widen the window — handy
for a search box that fires on every keystroke.
:::

## Reactive shapes: ref vs. reactive object

vuqs follows one rule for what it hands back:

- **A single value → a ref** (`.value`). `useQueryState` returns a [`QueryStateRef`](/guide/use-query-state).
- **A map of values → a reactive object** (dot-access). `useQueryStates` returns a
  reactive `values` where `values.q` *is* the value.

[Modules](/modules/introduction) follow the same rule: `withEffective`'s
`selected` and `defaults` are reactive objects (`selected.q`), while
`withContext`'s `activeContext` — a single scalar — is a ref (`activeContext.value`).

::: warning Replace, don't mutate
Reactive maps track *assignment*, not in-place mutation. `values.tags = [...next]`
navigates; `values.tags.push(x)` does not. Always replace the value.
:::

## Modules, in one sentence

When URL state alone isn't enough — when you also have **runtime defaults** or
**filters that should reset on a tab change** — [modules](/modules/introduction)
compose those behaviors onto `useQueryStates` with `.use()`, and you pull in only
the ones you need.
