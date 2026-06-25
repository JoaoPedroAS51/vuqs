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
    count: computed(() => Object.keys(core.state.selected.value).length),
  })
}
```

Return a generic `(core) => api` function rather than one bound to a fixed schema,
so the module adapts to whatever schema it's applied to — the pattern every
built-in uses. When the API *or* the options need to reference param names, use the
`QueryModule<TSchema, TAdded>` overload form instead, as [`withContext`](/modules/context#typing-preserve-and-only)
does.

## The core

`core` is the only thing a module touches — it never references another module.
Its members are grouped into facets:

| Facet | Member | What it is |
| --- | --- | --- |
| | `schema` | The schema being managed. |
| `state` | `selected` | `ComputedRef` of explicit URL selections plus the optimistic overlay, with the `read` pipeline applied and no defaults. Derive read state from this. |
| | `values` | `ComputedRef` of the resolved reads: the selection layered over `defaults.resolved`. |
| `defaults` | `resolved` | `ComputedRef` of the merged default layers (codec base + registered), `read` applied. |
| | `register(source)` | Register a reactive default layer above the codec base; later layers win. Returns a disposer. |
| `query` | `current()` | Read the current committed query. |
| | `set(key, value, options?)` | Optimistically write one param. |
| `options` | | The resolved behavior baseline (`history`/`scroll`/`throttleMs`/`clearOnDefault`), so a query you build matches the engine's write behavior. |
| `pipeline` | | The transform pipeline for reshaping reads and writes. |
| `hooks` | | The notification bus for module-to-module coordination. |

Treat `core` as the authoring surface — it's not app-facing state.

## Deriving state

Build read models off `core.state.selected` with `computed`. To expose a *map*,
wrap it with `toReadonlyState` so consumers get dot-access (`state.field`),
matching `values`:

```ts
import { computed } from 'vue'
import { toReadonlyState } from 'vuqs/shared'

const visible = computed(() => /* derive a record from core.state.selected.value */)

return { visible: toReadonlyState(visible) }
```

`toReadonlyState` turns a `ComputedRef<record>` into a `Readonly<record>` whose keys
track the computed live — the shape `withEffective` exposes for `selected` and
`defaults`. A single scalar stays a plain `ComputedRef` (`.value`), like
`withContext`'s `activeContext`.

## Layered defaults

The engine resolves values through a stack of default layers. The codec defaults
are the base; a module contributes a reactive layer above them with
`core.defaults.register(source)`, and later registrations win. `core.state.values`
is the selection layered over `core.defaults.resolved`, the merged read.

```ts
import { onScopeDispose, ref } from 'vue'

const runtimeDefaults = ref({})
const stop = core.defaults.register(runtimeDefaults)
onScopeDispose(stop)
```

The `source` is a `MaybeRefOrGetter`, so the layer stays reactive — update the ref
and `values`/`resolved` re-resolve. Only defined values participate, so a layer
never clobbers a lower one with `undefined`.

Registering a layer also moves [`clearOnDefault`](/guide/navigation-options#clearondefault):
a write clears when it equals the *resolved* default, not just the codec default.
Reads and writes share one notion of "the default", which is what lets
`withEffective` persist a write of the codec default while a differing runtime
default exists.

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

// Drop params failing a (possibly reactive) predicate from reads and writes.
const untap = core.pipeline.tap(['read', 'write'], pickBy(key => isAllowed(key)))
onScopeDispose(untap)
```

`vuqs/shared` ships the two filter builders: `pickBy(predicate)` keeps matching
keys, `omitBy(predicate)` drops them. Both return a transform you hand straight to
`tap`.

When a module derives a value map itself and wants it shaped like the engine's own
reads, push it through a stage with `run`:

```ts
const shaped = computed(() => core.pipeline.run('read', { ...someMap }))
```

The engine already runs `read` over `core.defaults.resolved` and
`core.state.values`, so a layer you `register` is shaped consistently with a filter
`withContext` taps onto `read` — no manual `run` needed for it.

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
filters. It drops disallowed params from reads and writes, emits an event when the
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

    // Disallowed params never reach the app or the URL; re-filters when the list changes.
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

## Authoring types <Badge type="info" text="vuqs" />

The exact shapes a module works with, exported from `vuqs` (the
[`vuqs/shared`](#vuqs-shared-helpers) helpers below come from their own subpath).

```ts
type QueryModule<TSchema, TAdded> = (core: QueryCore<TSchema>) => TAdded

interface QueryCore<TSchema> {
  schema: TSchema
  state: QueryStateReads<TSchema>          // { selected, values }
  defaults: QueryDefaultsBus<TSchema>      // { resolved, register }
  options: ResolvedQueryStateOptions       // resolved history/scroll/throttleMs/clearOnDefault
  pipeline: QueryPipelineBus
  hooks: QueryHookBus
  query: {
    current: () => ParsedQuery             // the current committed query
    set: (key, value, options?: NavigateOptions) => void // optimistically set one param
  }
}
```

### State, defaults, and options <Badge type="info" text="vuqs" />

The facets are exported from `vuqs`, so a module can name them.

```ts
interface QueryStateReads<TSchema> {
  selected: ComputedRef<QueryStateValues<TSchema>> // selections + overlay, `read` applied, no defaults
  values: ComputedRef<QueryStateValues<TSchema>>   // selection over the resolved defaults
}

interface QueryDefaultsBus<TSchema> {
  resolved: ComputedRef<QueryStateValues<TSchema>> // merged layers, `read` applied
  register: (source: MaybeRefOrGetter<QueryStateValues<TSchema>>) => () => void
}

interface ResolvedQueryStateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
  throttleMs: number
  clearOnDefault: boolean
}
```

### Hooks

`QueryHooks` is empty in the core; a module declares its event via
`declare module 'vuqs'`. Handlers run synchronously, in an unspecified order, and
must be commutative; a throwing handler is isolated and logged.

```ts
interface QueryHooks {} // augment to add typed events, e.g. 'context:change'

interface QueryHookBus {
  on: <E extends keyof QueryHooks>(event: E, handler: QueryHooks[E]) => () => void
  emit: <E extends keyof QueryHooks>(event: E, ...args: Parameters<QueryHooks[E]>) => void
}
```

### Pipeline

Stages are core-owned and closed; transforms must be pure.

```ts
interface QueryPipeline {
  read: (values: QueryValues) => QueryValues          // values the app reads
  write: (values: QueryValues) => QueryValues          // values written to the URL
  navigate: (query: ParsedQueryRaw) => ParsedQueryRaw  // serialized query at the navigation boundary
}
type QueryPipelineStage = keyof QueryPipeline // 'read' | 'write' | 'navigate'
type Enforce = 'pre' | 'default' | 'post'

interface QueryPipelineBus {
  tap: <S extends QueryPipelineStage>(
    stage: S | S[],
    transform: QueryPipeline[S],
    options?: { enforce?: Enforce },
  ) => () => void
  run: <S extends QueryPipelineStage>(stage: S, value: Parameters<QueryPipeline[S]>[0]) => ReturnType<QueryPipeline[S]>
}
type QueryValues = Record<string, unknown>
```

### `vuqs/shared` helpers <Badge type="tip" text="vuqs/shared" />

```ts
function pickBy(predicate: (key: string) => boolean): <T>(values: T) => Partial<T>
function omitBy(predicate: (key: string) => boolean): <T>(values: T) => Partial<T>
function definedOnly<T>(values: T): T
function toReadonlyState<T>(source: ComputedRef<T>): Readonly<T>
```

- `pickBy` / `omitBy` — build a pipeline transform that keeps / drops matching keys.
- `definedOnly` — copy without `undefined`-valued keys (a cleared param reads as absent).
- `toReadonlyState` — expose a `ComputedRef<record>` as a readonly reactive object.

## Nuxt

Auto-imports cover the published modules. A module you write lives in your app, so
import it normally — or register it under Nuxt's `imports` if you want it
auto-imported alongside the [`vuqs/modules` group](/nuxt/introduction#auto-imports).
