# Modules

The [core](/guide/introduction) solves one problem: a typed value ⇄ the URL.
That's enough for most apps. Richer filtering UIs often need more — runtime
defaults that never reach the URL, fields that reset when a tab changes — without
the core taking on those opinions.

**Modules** are how you add them. A module is an opt-in unit of behavior you
compose onto [`useQueryStates`](/guide/use-query-states) with `.use()`. The core
stays small; you pull in only the modules you need.

```ts
import { codecs, defineQueryState, useQueryStates } from 'vuqs'
import { withContext, withEffective } from 'vuqs/modules'

const { effective, activeContext } = useQueryStates(schema)
  .use(withEffective())
  .use(withContext({ active: tab, preserve: ['q'] }))

effective.status    // from withEffective
activeContext.value // from withContext
```

## The `.use()` model

`useQueryStates(schema, options)` returns a composable carrying the base API
(`values`, `setValues`, `clear`) plus a `.use(module)` method. Each `.use()` call
runs the module, merges the API it contributes onto the composable, and widens the
return type with that API. Calls chain, and the accumulated type reflects every
module applied:

```ts
const { values, effective, switchTo } = useQueryStates(schema)
  .use(withEffective())         // adds selected, defaults, effective, setDefaults, …
  .use(withContext({ active })) // adds activeContext, switchTo, buildContextQuery
```

A module is a function `(core) => addedApi`. Modules never reference each other —
they coordinate only through the shared `core` the composable hands each one. That
keeps them independent: any module works alone, and combinations compose without
special-casing. Where two modules do interact (for example, [`withContext`](/modules/context)
resetting the per-context defaults held by [`withEffective`](/modules/effective)),
they do it through `core`, not a direct dependency. The same `core` is the surface
for [writing your own module](/modules/authoring).

## The `vuqs/modules` subpath

Modules ship with the `vuqs` package but live under a separate entry point so they
tree-shake independently of the core:

```ts
import { withContext, withEffective } from 'vuqs/modules'
```

Importing the core never pulls in module code. Under Nuxt, the
[`@vuqs/nuxt`](/nuxt/introduction#auto-imports) module auto-imports them, so you
skip the import line entirely.

## Available modules

| Module | Adds | |
| --- | --- | --- |
| [`withEffective`](/modules/effective) | `selected` / `defaults` / `effective` states and runtime defaults | [→](/modules/effective) |
| [`withContext`](/modules/context) | context-aware field validity and reset/preserve on context change | [→](/modules/context) |

The set is open-ended — new modules slot in here without changing the ones above.

## When you don't need modules

If you only sync state to the URL — no runtime defaults, no context reset — stay
with [`useQueryState`](/guide/use-query-state) /
[`useQueryStates`](/guide/use-query-states). Modules are additive: the same
[schema](/guide/concepts#schema-a-map-of-fields) works with or without them, so you
can adopt one later without rewriting your fields.

Next: **[withEffective →](/modules/effective)**
