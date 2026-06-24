# Writing a module

A module is a function `(core) => addedApi`. `.use(module)` runs it against the
composable's shared [`QueryCore`](#the-core), merges the returned object onto the
composable, and widens the type. That's the whole contract — everything below is
what `core` gives you to work with.

```ts
import type { ComputedRef } from 'vue'
import type { QueryCore, QueryStateSchema } from 'vuqs'
import { computed } from 'vue'

export function withCount(): <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => { count: ComputedRef<number> } {
  return core => ({
    count: computed(() => Object.keys(core.selected.value).length),
  })
}
```

Return a generic `(core) => api` function rather than one bound to a fixed schema,
so the module adapts to whatever schema it's applied to — the pattern every
built-in uses. When the API *or* the options need to reference field names, use the
`QueryModule<TSchema, TAdded>` overload form instead, as [`withContext`](/modules/context#typing-preserve-and-only)
does.

## The core

`core` is the only thing a module touches — it never references another module.

| Member | What it is |
| --- | --- |
| `schema` | The schema being managed. |
| `selected` | `ComputedRef` of explicit URL selections plus the optimistic overlay, with the `read` pipeline applied and no codec defaults. Derive read state from this. |
| `setValue(key, value, options?)` | Optimistically write one field. |
| `navigate(query, options?)` | Apply a full query to the URL — runs the `navigate` stage and resolves the default navigation options. |
| `currentQuery()` | Read the current parsed query. |
| `hooks` | The notification bus for module-to-module coordination. |
| `pipeline` | The transform pipeline for reshaping reads and writes. |
| `clearOnDefault` | The resolved rule, so a query you build matches the engine's write behavior. |

Treat `core` as the authoring surface — it's not app-facing state.

## Deriving state

Build read models off `core.selected` with `computed`. To expose a *map*, wrap it
with `toReadonlyState` so consumers get dot-access (`state.field`), matching
`values`:

```ts
import { computed } from 'vue'
import { toReadonlyState } from 'vuqs/shared'

const visible = computed(() => /* derive a record from core.selected.value */)

return { visible: toReadonlyState(visible) }
```

`toReadonlyState` turns a `ComputedRef<record>` into a `Readonly<record>` whose keys
track the computed live — the shape `withEffective` exposes for
`selected`/`defaults`/`effective`. A single scalar stays a plain `ComputedRef`
(`.value`), like `withContext`'s `activeContext`.

## Shaping reads and writes — the pipeline

`core.pipeline` reshapes the value maps the engine reads and writes. Three stages,
owned by the core — you tap them, you can't add new ones:

| Stage | Reshapes |
| --- | --- |
| `read` | the values the app reads (`values`, and module state run through the pipeline) |
| `write` | the values written to the URL on a navigation |
| `navigate` | the serialized query at the navigation boundary |

`tap(stage | stages, transform, { enforce })` registers a transform and returns a
disposer; `enforce` (`'pre' | 'default' | 'post'`) orders it within the stage.
Transforms must be **pure** functions of their input: reactivity is pull-based, so
a transform may *read* reactive sources — it re-runs when they change — but must not
mutate or cause side effects.

```ts
import { pickBy } from 'vuqs/shared'

// Drop fields failing a (possibly reactive) predicate from reads and writes.
const untap = core.pipeline.tap(['read', 'write'], pickBy(key => isAllowed(key)))
onScopeDispose(untap)
```

`vuqs/shared` ships the two filter builders: `pickBy(predicate)` keeps matching
keys, `omitBy(predicate)` drops them. Both return a transform you hand straight to
`tap`.

When a module derives a value map itself and wants it shaped like the engine's own
reads, push it through a stage with `run`:

```ts
const defaults = computed(() => core.pipeline.run('read', { ...codecDefaults }))
```

That's how `withEffective` keeps its `defaults` consistent with a filter
`withContext` taps onto `read`.

## Coordinating with other modules — hooks

Modules never import each other. When one needs to react to another, they pass
through `core.hooks`, a fire-and-forget bus. Declare your event on the shared
`QueryHooks` interface so it's typed everywhere without an import:

```ts
declare module 'vuqs' {
  interface QueryHooks {
    'context:change': (context: string) => void
  }
}
```

Namespace the key by module (`'context:change'`). Emit when your state changes;
subscribe to others' events with `on`, pairing the disposer with `onScopeDispose`:

```ts
// publisher
watch(active, next => core.hooks.emit('context:change', next))

// subscriber, in a different module
const stop = core.hooks.on('context:change', () => { /* reset per-context state */ })
onScopeDispose(stop)
```

Handlers run synchronously in an unspecified order and must be commutative — don't
rely on ordering. A throwing handler is isolated and logged; it never aborts the
others or the emitter. This is exactly how `withContext` tells `withEffective` to
drop per-context defaults, with neither importing the other.

## Lifecycle and cleanup

A module runs synchronously inside the `useQueryStates` call's effect scope.
Anything that outlives the call — a `pipeline.tap`, a `hooks.on`, a `watch` —
returns a disposer; pair each with `onScopeDispose` so it's torn down with the
scope.

```ts
import { onScopeDispose } from 'vue'

const untap = core.pipeline.tap('write', transform)
onScopeDispose(untap)
```

## The returned API

Whatever you return is merged onto the composable and widens its type, so
`q.yourField` is typed. Keys must be unique across modules — `.use()` throws if a
module returns a key an earlier one already provided:

```
[vuqs] module key "selected" is already provided by an earlier module
```

Avoid the base API names (`values`, `setValues`, `clear`, `use`) and the keys of
any module you expect to compose with.

## Full example

A module that restricts the schema to an allow-list — useful for feature-flagged
filters. It drops disallowed fields from reads and writes, emits an event when the
list changes, and exposes `isAllowed`:

```ts
// with-allow-list.ts
import type { MaybeRefOrGetter } from 'vue'
import type { QueryCore, QueryStateSchema } from 'vuqs'
import { computed, onScopeDispose, toValue, watch } from 'vue'
import { pickBy } from 'vuqs/shared'

declare module 'vuqs' {
  interface QueryHooks {
    'allow:change': (allowed: readonly string[]) => void
  }
}

export interface AllowListApi {
  isAllowed: (key: string) => boolean
}

export function withAllowList(
  allowed: MaybeRefOrGetter<readonly string[]>,
): <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => AllowListApi {
  return (core) => {
    const allowList = computed(() => toValue(allowed))
    const isAllowed = (key: string) => allowList.value.includes(key)

    // Disallowed fields never reach the app or the URL; re-filters when the list changes.
    const untap = core.pipeline.tap(['read', 'write'], pickBy(isAllowed))
    onScopeDispose(untap)

    // Let other modules react to the list changing.
    const stop = watch(allowList, value => core.hooks.emit('allow:change', value))
    onScopeDispose(stop)

    return { isAllowed }
  }
}
```

```ts
const { values, isAllowed } = useQueryStates(schema)
  .use(withAllowList(() => enabledFilters.value))

isAllowed('status') // false → `status` is filtered out of `values` and the URL
```

It reads `core` only — `pickBy` on the pipeline, `emit` on the hooks bus — so it
composes with any other module without knowing it exists.

## Nuxt

Auto-imports cover the published modules. A module you write lives in your app, so
import it normally — or register it under Nuxt's `imports` if you want it
auto-imported alongside the [`vuqs/modules` group](/nuxt/introduction#auto-imports).

See the [API reference](/api/modules#authoring) for the exact authoring types.
