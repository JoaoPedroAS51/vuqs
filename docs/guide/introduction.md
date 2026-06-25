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

vuqs is built in two layers so you take only what you need.

### The core

The "nuqs for Vue" layer. It solves one problem well: **a typed value ⇄ the URL**.

- [`codecs`](/guide/codecs) — typed converters between a value and its query form.
- [`useQueryState`](/guide/use-query-state) — bind one key to a writable ref.
- [`useQueryStates`](/guide/use-query-states) — bind a group of keys to a reactive map.
- [Adapters](/guide/adapters) — plug in `vue-router`, Nuxt, or your own.

The core is pure URL state. It has no concept of "loading runtime defaults"
or "resetting filters when you change tabs" — those are [modules](/modules/introduction).

### Modules

Opt-in behavior you compose onto `useQueryStates` with `.use()`, imported from the
[`vuqs/modules`](/modules/introduction) subpath of the same package:

- **[`withEffective`](/modules/effective)** — runtime defaults layered under the
  bound state, so `values` reads through them while only `selected` reaches the URL.
- **[`withContext`](/modules/context)** — preserve some filters and reset others
  when the user switches tabs, steps through a wizard, or changes route.

The set is open-ended — more modules ship over time. If you only need URL ⇄ state,
you never have to touch them.

## How it compares

vuqs is inspired by [nuqs](https://nuqs.47ng.com/) (the React library) but is a
ground-up Vue implementation, not a port:

| | nuqs (React) | vuqs (Vue) |
| --- | --- | --- |
| Reactivity | hooks / `useState` | refs & reactive maps |
| Value ⇄ URL | ✅ parsers | ✅ codecs |
| Runtime defaults | — | ✅ [`withEffective`](/modules/effective) |
| Context-aware reset | — | ✅ [`withContext`](/modules/context) |

The runtime defaults layer and context machinery are vuqs's own — they grew out of
real Vue app filtering needs, packaged as composable [modules](/modules/introduction).

## Requirements

- **Vue 3.5+** (peer dependency)
- **Node 22+** for local development
- A router is optional. `vue-router` is an optional peer dependency, used only by
  the [vue-router adapter](/guide/adapters#vue-router).

Ready? Head to **[Getting started](/guide/getting-started)**.
