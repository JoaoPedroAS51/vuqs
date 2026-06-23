# What is vuqs?

**vuqs** (Vue + query state) keeps a slice of your application state in the URL's
query string, with full type safety. Instead of holding search terms, filters,
sort order, and pagination in local component state, you bind them to query keys —
and get reactive, typed refs back.

```ts
import { codecs, useQueryState } from 'vuqs'

const page = useQueryState('page', codecs.integer.withDefault(1))
//    ^? QueryStateRef<number>

page.value++ // URL becomes ?page=2
```

The result is one typed source of truth for view state, instead of a local `ref`
you sync with the URL by hand.

## Why put state in the URL?

A surprising amount of UI state is really *view* state — it describes what the
user is looking at, not what the application *is*. That kind of state belongs in
the URL:

- **One source of truth** — no local `ref` to keep in sync with the URL by hand.
- **Shareable** — the full filtered, sorted, paginated view lives in the link.
- **History-aware** — writes integrate with `push`/`replace` navigation.

The hard part has always been the plumbing: parsing strings into the right types,
serializing back, handling defaults, coalescing rapid writes, and keeping it all
reactive. vuqs is that plumbing, done once and typed end to end.

## Two layers

vuqs ships as two packages so you take only what you need.

### `vuqs` — the core

The "nuqs for Vue" layer. It solves one problem well: **a typed value ⇄ the URL**.

- [`codecs`](/guide/codecs) — typed converters between a value and its query form.
- [`useQueryState`](/guide/use-query-state) — bind one key to a writable ref.
- [`useQueryStates`](/guide/use-query-states) — bind a group of keys to a reactive map.
- [Adapters](/guide/adapters) — plug in `vue-router`, Nuxt, or your own.

The core is pure URL state. It has no concept of "loading runtime defaults"
or "resetting filters when you change tabs" — that is the store's job.

### `@vuqs/store` — the opinionated store

Layered on top of the core for apps with richer needs:

- **[Three states](/store/three-states)** — `selected` (the URL), `defaults`
  (supplied at runtime), and a derived `effective` read model.
- **[Context-aware reset](/store/context)** — preserve some filters and reset
  others when the user switches tabs, steps through a wizard, or changes route.

If you only need URL ⇄ state, you never have to touch the store.

## How it compares

vuqs is inspired by [nuqs](https://nuqs.47ng.com/) (the React library) but is a
ground-up Vue implementation, not a port:

| | nuqs (React) | vuqs (Vue) |
| --- | --- | --- |
| Reactivity | hooks / `useState` | refs & reactive maps |
| Value ⇄ URL | ✅ parsers | ✅ codecs |
| Runtime defaults | — | ✅ `@vuqs/store` |
| Context-aware reset | — | ✅ `@vuqs/store` |
| Adapter | required | optional |

The runtime defaults layer and context machinery are vuqs's own — they grew out of
real Vue app filtering needs.

## Requirements

- **Vue 3.5+** (peer dependency)
- **Node 22+** for local development
- A router is optional. `vue-router` is an optional peer dependency, used only by
  the [vue-router adapter](/guide/adapters#vue-router).

Ready? Head to **[Getting started](/guide/getting-started)**.
