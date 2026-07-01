# Writing a module

A module contributes API to a group (`useQueryStates`), to a single param
(`useQueryState`), or to both. It receives the shared [`QueryCore`](#the-core),
returns the object to merge onto the composable, and `.use()` widens the type.

## The grouped module

The simplest module is a function `(core) => api`, a `QueryStatesModule`. Pass it
straight to `useQueryStates(...).use(...)`:

```ts
import type { QueryCore, QueryStateSchema } from '@vuqs/core'
import { computed } from 'vue'

export function withCount() {
  return <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => ({
    count: computed(() => Object.keys(core.state.selected.value).length),
  })
}
```

Return a generic `(core) => api` function rather than one bound to a fixed schema,
so the module adapts to whatever schema it is applied to. Everything below is what
`core` gives you to work with; [single-param and dual modules](#single-param-and-dual-modules)
extend this to `useQueryState`.

## The core

`core` is the only thing a module touches: it never references another module. Its
members are grouped into facets:

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

Treat `core` as the authoring surface: it is not app-facing state.

## Deriving state

Build read models off `core.state.selected` with `computed`. To expose a *map*,
wrap it with `toReadonlyState` so consumers read `state.field`, matching `values`:

```ts
import { toReadonlyState } from '@vuqs/core/shared'
import { computed } from 'vue'

const visible = computed(() => { /* derive a record from core.state.selected.value */ })

return { visible: toReadonlyState(visible) }
```

`toReadonlyState` turns a `ComputedRef<record>` into a `Readonly<record>` whose keys
track the computed live, the shape `withRuntimeDefaults` exposes for `selected` and
`defaults`. A single scalar stays a plain `ComputedRef`, like `withContext`'s
`activeContext`.

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

The `source` is a `MaybeRefOrGetter`, so the layer stays reactive: update the ref
and `values`/`resolved` re-resolve. Only defined values participate, so a layer
never clobbers a lower one with `undefined`.

Registering a layer also moves
[`clearOnDefault`](/guide/essentials/navigation-options#clearondefault): a write
clears when it equals the *resolved* default, not just the codec default. Reads and
writes share one notion of "the default", which is what lets `withRuntimeDefaults`
persist a write of the codec default while a differing runtime default exists.

## Shaping reads and writes

`core.pipeline` reshapes the value maps the engine reads and writes. Three stages,
owned by the core: you tap them, you can't add new ones.

| Stage | Reshapes |
| --- | --- |
| `read` | the values the app reads (`values`, and module state run through the pipeline) |
| `write` | the values written to the URL on a navigation |
| `navigate` | the serialized query at the navigation boundary |

`tap(stage | stages, transform, { enforce })` registers a transform and returns a
disposer; `enforce` (`'pre' | 'default' | 'post'`) orders it within the stage.
Transforms must be **pure** functions of their input. Reactivity is pull-based, so
a transform may *read* reactive sources (it re-runs when they change) but must not
mutate or cause side effects.

```ts
import { pickBy } from '@vuqs/core/shared'

// Drop params failing a (possibly reactive) predicate from reads and writes.
const untap = core.pipeline.tap(['read', 'write'], pickBy(key => isAllowed(key)))
onScopeDispose(untap)
```

`@vuqs/core/shared` ships the two filter builders: `pickBy(predicate)` keeps
matching keys, `omitBy(predicate)` drops them. Both return a transform you hand
straight to `tap`.

When a module derives a value map itself and wants it shaped like the engine's own
reads, push it through a stage with `run`:

```ts
const shaped = computed(() => core.pipeline.run('read', { ...someMap }))
```

## Coordinating with other modules

Modules never import each other. When one needs to react to another, they pass
through `core.hooks`, a fire-and-forget bus, using a typed [signal](/modules/signals).
Declare your event on the shared `QueryHooks` interface so it is typed everywhere
without an import:

```ts
declare module '@vuqs/core' {
  interface QueryHooks {
    'context:change': (context: string) => void
  }
}
```

Namespace the key by module (`'context:change'`). Emit when your state changes, and
subscribe to others' events with `on`, pairing the disposer with `onScopeDispose`:

```ts
// publisher
watch(active, next => core.hooks.emit('context:change', next))

// subscriber, in a different module
const stop = core.hooks.on('context:change', () => { /* reset per-context state */ })
onScopeDispose(stop)
```

Handlers run synchronously in an unspecified order and must be commutative, so do
not rely on ordering. A throwing handler is isolated and logged: it never aborts
the others or the emitter. The public signals modules can emit or react to are
listed in the [Signals](/modules/signals) registry.

## Single-param and dual modules

A single-param module contributes API to `useQueryState`. Its projection receives
`core` plus the logical `key` of the bound param. `defineQueryModule` packages the
projections: `queryStates` for the group, `queryState` for the single param, either
or both.

```ts
import { defineQueryModule } from '@vuqs/core'

export function withPresence() {
  return defineQueryModule({
    // group projection: (core) => api
    queryStates: core => ({
      present: computed(() => Object.keys(core.state.selected.value)),
    }),
    // single projection: (core, key) => api
    queryState: (core, key) => ({
      isPresent: computed(() => core.state.selected.value[key] !== undefined),
    }),
  })
}
```

Omit `queryStates` for a single-only module, or `queryState` for a grouped-only
one. A grouped module stays callable, so existing function-only modules keep
working with `useQueryStates`.

### Value-typed single APIs

When a single-param API depends on the **bound param's value type** (a `ComputedRef`
of that value, a setter that takes it), a plain projection cannot express it
soundly. Register the API shape on `QueryStateApiRegistry` under a namespaced URI,
then build the projection with `defineQueryStateApi`:

```ts
import type { QueryStateSchema, QueryStateValueAt } from '@vuqs/core'
import { defineQueryModule, defineQueryStateApi } from '@vuqs/core'
import { computed } from 'vue'

declare module '@vuqs/core' {
  interface QueryStateApiRegistry<TSchema extends QueryStateSchema, TKey extends keyof TSchema & string> {
    'my-lib:selection': { selection: ComputedRef<QueryStateValueAt<TSchema, TKey> | undefined> }
  }
}

export function withSelection() {
  return defineQueryModule({
    queryState: defineQueryStateApi('my-lib:selection', (core, key) => ({
      selection: computed(() => core.state.selected.value[key]),
    })),
  })
}
```

`useQueryState` resolves the registered shape against the concrete schema and key,
so `ref.selection` is typed as the bound param's value. This is exactly how
`withRuntimeDefaults` exposes `selectedValue`/`defaultValue` on a single ref.

## Lifecycle and cleanup

A module runs synchronously inside the composable's effect scope. Anything that
outlives the call (a `pipeline.tap`, a `hooks.on`, a `watch`) returns a disposer.
Pair each with `onScopeDispose` so it is torn down with the scope.

```ts
import { onScopeDispose } from 'vue'

const untap = core.pipeline.tap('write', transform)
onScopeDispose(untap)
```

## The returned API

Whatever you return is merged onto the composable and widens its type. Keys must be
unique across modules: `.use()` throws if a module returns a key an earlier one
already provided.

```
[vuqs] module key "selected" is already provided by an earlier module
```

Avoid the base API names (`values`, `setValues`, `clear`, `use`) and the keys of
any module you expect to compose with.

## Full example

A grouped module that restricts the schema to an allow-list, useful for
feature-flagged filters. It drops disallowed params from reads and writes, emits an
event when the list changes, and exposes `isAllowed`:

```ts
// with-allow-list.ts
import type { QueryCore, QueryStateSchema } from '@vuqs/core'
import type { MaybeRefOrGetter } from 'vue'
import { pickBy } from '@vuqs/core/shared'
import { computed, onScopeDispose, toValue, watch } from 'vue'

declare module '@vuqs/core' {
  interface QueryHooks {
    'allow:change': (allowed: readonly string[]) => void
  }
}

export function withAllowList(allowed: MaybeRefOrGetter<readonly string[]>) {
  return <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => {
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

It reads `core` only (`pickBy` on the pipeline, `emit` on the hooks bus), so it
composes with any other module without knowing it exists.

## Authoring types <Badge type="info" text="@vuqs/core" />

The exact shapes a module works with, exported from `@vuqs/core` (the
[`@vuqs/core/shared`](#vuqs-core-shared-helpers) helpers below come from their own
subpath).

```ts
// Projections
type QueryStatesModule<TSchema, TApi> = (core: QueryCore<TSchema>) => TApi
type QueryStateModule<TSchema, TApi> = (core: QueryCore<TSchema>, key: keyof TSchema & string) => TApi

// Packaged modules, from defineQueryModule
type DefinedQueryStatesModule<TSchema, TApi> // grouped-only
type DefinedQueryStateModule<TApi> // single-only
type DefinedQueryModule<TSchema, TStatesApi, TStateApi> // both

// Registry for value-typed single-param APIs
interface QueryStateApiRegistry<TSchema, TKey> {} // augment to register a URI
type QueryStateApiUri = keyof QueryStateApiRegistry<QueryStateSchema, string>

function defineQueryModule(definition: { queryStates?, queryState? }): …
function defineQueryStateApi(uri, project): DefinedQueryStateApi<Uri>
```

### The core <Badge type="info" text="@vuqs/core" />

```ts
interface QueryCore<TSchema> {
  schema: TSchema
  state: { selected: ComputedRef<…>, values: ComputedRef<…> }
  defaults: { resolved: ComputedRef<…>, register: (source) => () => void }
  options: ResolvedQueryStateOptions // resolved history/scroll/throttleMs/clearOnDefault
  pipeline: QueryPipelineBus // tap, run
  hooks: QueryHookBus // on, emit
  query: {
    current: () => ParsedQuery
    set: (key, value, options?: NavigateOptions) => void
  }
}
```

### Hooks

`QueryHooks` is empty in the core; a module declares its event via
`declare module '@vuqs/core'`. Handlers run synchronously, in an unspecified order,
and must be commutative; a throwing handler is isolated and logged.

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
  read: (values: QueryValues) => QueryValues
  write: (values: QueryValues) => QueryValues
  navigate: (query: ParsedQueryRaw) => ParsedQueryRaw
}
type QueryPipelineStage = keyof QueryPipeline // 'read' | 'write' | 'navigate'

interface QueryPipelineBus {
  tap: <S extends QueryPipelineStage>(stage: S | S[], transform: QueryPipeline[S], options?: { enforce?: 'pre' | 'default' | 'post' }) => () => void
  run: <S extends QueryPipelineStage>(stage: S, value: Parameters<QueryPipeline[S]>[0]) => ReturnType<QueryPipeline[S]>
}
```

### `@vuqs/core/shared` helpers <Badge type="tip" text="@vuqs/core/shared" />

```ts
function pickBy(predicate: (key: string) => boolean): <T>(values: T) => Partial<T>
function omitBy(predicate: (key: string) => boolean): <T>(values: T) => Partial<T>
function definedOnly<T>(values: T): T
function toReadonlyState<T>(source: ComputedRef<T>): Readonly<T>
```

- `pickBy` / `omitBy`: build a pipeline transform that keeps / drops matching keys.
- `definedOnly`: copy without `undefined`-valued keys (a cleared param reads as absent).
- `toReadonlyState`: expose a `ComputedRef<record>` as a readonly reactive object.

## Nuxt

Auto-imports cover the published modules and `defineQueryModule`. A module you
write lives in your app, so import it normally, or register it under Nuxt's
`imports` if you want it auto-imported alongside the
[`@vuqs/core/modules` group](/nuxt/auto-imports).
