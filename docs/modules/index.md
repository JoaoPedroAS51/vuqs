# Modules

The [core](/guide/essentials/concepts) solves one problem: a typed value and the
URL. That covers most apps. When you need behavior layered on top, for example
values resolved at runtime or state that reacts to app context, a **module** adds
it without the core taking on the opinion.

A module is an opt-in unit of behavior you compose onto
[`useQueryStates`](/guide/essentials/use-query-states) (a group) or
[`useQueryState`](/guide/essentials/use-query-state) (one param) with `.use()`. The
core stays small, and you pull in only the modules you need.

```ts
import { useQueryStates } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'

const { values, setDefaults } = useQueryStates(schema).use(withRuntimeDefaults())
```

## The `.use()` model

Both `useQueryStates` and `useQueryState` return something with a `.use(module)`
method. Each call runs the module, merges the API it contributes, and widens the
return type. Calls chain, and the accumulated type reflects every module applied:

```ts
// on a group
const { values, selected, switchTo } = useQueryStates(schema)
  .use(withRuntimeDefaults()) // adds selected, defaults, setDefaults, clearDefaults
  .use(withContext({ active })) // adds activeContext, switchTo, buildContextQuery

// on a single param, merged onto the ref
const perPage = useQueryState('perPage', codecs.integer)
  .use(withRuntimeDefaults()) // adds setDefault, clearDefault, selectedValue, defaultValue
```

A module contributes a projection for the group, for a single param, or both. It
receives the shared `core` and returns the API to merge. Modules never reference
each other: they coordinate only through `core`, so any module works alone and
combinations compose without special-casing. Where two modules interact, they do it
through a shared [signal](/modules/signals), not a direct dependency.

## The `@vuqs/core/modules` subpath

Modules ship with the `@vuqs/core` package but live under a separate entry point,
so they tree-shake independently of the core:

```ts
import { withContext, withRuntimeDefaults } from '@vuqs/core/modules'
```

Importing the core never pulls in module code. Under Nuxt, the
[`@vuqs/nuxt`](/nuxt/auto-imports) module auto-imports them, so you skip the import
line entirely.

## Available modules

| Module | Adds |
| --- | --- |
| [`withRuntimeDefaults`](/modules/runtime-defaults) | runtime defaults layered under `values`, plus `selected` / `defaults` |
| [`withContext`](/modules/context) | context-aware param validity, and reset/preserve on a context change |

The set is open-ended: new modules slot in here without changing the ones above.

## When you don't need modules

If you only sync state to the URL, stay with
[`useQueryState`](/guide/essentials/use-query-state) and
[`useQueryStates`](/guide/essentials/use-query-states). Modules are additive: the
same [schema](/guide/essentials/concepts#schema-a-map-of-params) works with or
without them, so you can adopt one later without rewriting your params.

## Writing your own

The same `core` every built-in module receives is a documented surface. See
[Writing a module](/modules/authoring) to build your own, and
[Signals](/modules/signals) for how modules coordinate.
