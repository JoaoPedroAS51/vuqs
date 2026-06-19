# Modules

The [core](/guide/essentials/concepts) binds typed values to the URL. Additional
behavior, such as runtime defaults or context-dependent state, lives in opt-in
**modules** composed onto
[`useQueryStates`](/guide/essentials/use-query-states) (a group) or
[`useQueryState`](/guide/essentials/use-query-state) (one param) with `.use()`. The
core remains independent of those policies.

```ts
import { useQueryStates } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'

const { values, setDefaults } = useQueryStates(schema).use(withRuntimeDefaults())
```

## The `.use()` model

Both `useQueryStates` and `useQueryState` return something with a `.use(module)`
method. Each call runs the module, merges the API it contributes, and widens the
return type. Calls chain, and the accumulated type reflects every module applied.
Built-ins are [order-independent](/modules/composition#order-independence), so
choose the order that reads most clearly:

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
through shared core mechanisms, not a direct dependency. See
[Composing built-in modules](/modules/composition) for the material interactions
and [Signals](/modules/signals) for the event registry.

## The `@vuqs/core/modules` subpath

Modules ship with the `@vuqs/core` package but live under a separate entry point,
so they tree-shake independently of the core:

```ts
import { withActiveParams, withContext, withRuntimeDefaults, withStorage } from '@vuqs/core/modules'
```

Importing the core never pulls in module code. Under Nuxt, the
[`@vuqs/nuxt`](/nuxt/auto-imports) module auto-imports them.

## Available modules

| Module | Adds |
| --- | --- |
| [`withRuntimeDefaults`](/modules/runtime-defaults) | runtime defaults layered under `values`, plus `selected` / `defaults` |
| [`withContext`](/modules/context) | context-aware param validity, and reset/preserve on a context change |
| [`withActiveParams`](/modules/active-params) | active keys, count, aggregate flag, and per-param checks against resolved defaults |
| [`withStorage`](/modules/storage) | exact sync or async storage mirroring, with restore lifecycle controls |

Custom modules use the same composition surface without changing the built-ins.

## When you don't need modules

If you only sync state to the URL, stay with
[`useQueryState`](/guide/essentials/use-query-state) and
[`useQueryStates`](/guide/essentials/use-query-states). Modules are additive: the
same [schema](/guide/essentials/concepts#schema-a-map-of-params) works with or
without them.

## Writing your own

The same `core` every built-in module receives is a documented surface. See
[Writing a module](/modules/authoring) to build your own, and
[Composing built-in modules](/modules/composition) for the shared composition
model.
