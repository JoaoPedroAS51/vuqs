# Writing a module

A module contributes API to a group (`useQueryStates`), to a single param
(`useQueryState`), or to both. Its setup receives the shared [`QueryCore`](#the-core)
and returns the API to merge onto the composable, plus the default sources and
pipeline registrations it contributes. `.use()` widens the composable's type.

## Defining a module

`defineQueryModule` takes a `states` setup (`(core, options) => result`) for
`useQueryStates`, a `state` setup (`(core, key, options) => result`) for
`useQueryState`, or both. The setup callbacks are contextually typed, so inline
callbacks need no generics or parameter annotations:

```ts
import { codecs, defineQueryModule, useQueryState, useQueryStates } from '@vuqs/core'
import { computed } from 'vue'

const schema = { q: codecs.string }

export const withPresence = defineQueryModule({
  states: core => ({
    api: {
      present: computed(() => Object.keys(core.state.explicitValues.value)),
    },
  }),
  state: (core, key) => ({
    api: {
      isPresent: computed(() => core.state.explicitValues.value[key] !== undefined),
    },
  }),
})

useQueryStates(schema).use(withPresence()) // on a group
useQueryState('q').use(withPresence()) // on a single param
```

::: info Teaching example
`withPresence` is an authoring example, not a published module. It reports
explicit presence after optimistic writes and the read pipeline. [`withActiveParams`](/modules/active-params) is the
published module for values that differ from their resolved defaults.
:::

Provide only `states` for a group-only module, only `state` for a single-only one.
A setup returns an object with these members:

| Member | Contribution |
| --- | --- |
| `api` | Required. The object merged onto the composable. |
| `defaults` | Optional. [Default sources](#default-sources) installed with the module. |
| `pipeline` | Optional. [Descriptors](#shaping-reads-and-writes) created with `core.pipeline.define`. |

A module that only adds API returns `{ api }`. Only the sources and descriptors a
setup returns are installed; a descriptor that is created but not returned has no
effect. A malformed result is a type error at the definition.

### Factory and setup timing

Calling the factory captures the options and returns the module. It does not run
the setup. `.use()` selects the facade, runs the setup once inside an effect scope
owned by the binding, and installs what the setup returned.

The factory reads the facade from how you call it:

- `withPresence(options?)`: adaptive, the surrounding `.use` pins the facade and schema.
- `withPresence(schema, options)`: grouped, with the schema's keys checked.
- `withPresence(param, options)` / `withPresence('path', options)`: single-param form.

These arguments select the facade and provide type information. The composable
that calls `.use()` supplies the actual core and bound key.

::: tip Bare grouped shorthand
A group-only setup can also be a plain `(core) => result` function passed straight
to `useQueryStates(...).use(...)`, without wrapping it in `defineQueryModule`.
:::

## The core

`core` is the only thing a module touches: it never references another module. Its
members are grouped into facets:

| Facet | Member | What it is |
| --- | --- | --- |
| | `schema` | The schema being managed. Readonly. |
| `state` | `explicitValues` | `ComputedRef` of explicit param values plus the optimistic overlay, with the `read` pipeline applied and before engine default resolution. Derive read state from this. |
| | `values` | `ComputedRef` of the resolved reads: explicit values over the composed defaults. |
| `defaults` | `candidates` | `ComputedRef` of the composed default candidates: static defaults under every installed source, with the `defaults` read projection applied. |
| `query` | `current()` | Read the current committed query, without pending writes. |
| | `transact(request)` | Atomically write a partial or exhaustive state. |
| | `transactions` | Observe transaction starts that overlap this schema's raw paths. |
| `options` | | The resolved behavior baseline, so a query you build matches the engine's write behavior. Readonly. |
| `pipeline` | `define` | Creates a pipeline descriptor. |
| `hooks` | | The notification bus for module-to-module coordination. |
| `debug` | | The observation channel for this binding's runtime. |

Treat `core` as the authoring surface: it is not app-facing state. `schema` and
`options` are typed readonly; assigning to them is a type error and does not change
what the binding captured.

## Deriving state

Build read models off `core.state.explicitValues` with `computed`. To expose a *map*,
wrap it with `toReadonlyState` so consumers read `state.field`, matching `values`:

```ts
import { toReadonlyState } from '@vuqs/core/shared'
import { computed } from 'vue'

const visible = computed(() => { /* derive a record from core.state.explicitValues.value */ })

return { api: { visible: toReadonlyState(visible) } }
```

`toReadonlyState` turns a `ComputedRef<record>` into a `Readonly<record>` whose keys
track the computed live, the shape `withRuntimeDefaults` exposes for `explicitValues` and
`defaults`. A single scalar stays a plain `ComputedRef`, like `withContext`'s
`activeContext`.

## Default sources

Values resolve through a stack of default sources over the static defaults declared
on params. A setup contributes a reactive source by returning it in `defaults`:

```ts
import { defineQueryModule } from '@vuqs/core'
import { ref } from 'vue'

export const withSeed = defineQueryModule({
  states: () => {
    const seed = ref({})

    return {
      api: { seed: (values: object) => { seed.value = values } },
      defaults: [seed],
    }
  },
})
```

A source is a value, a ref or a getter, so it stays reactive: update the ref and
`values` and `candidates` re-resolve. A source supplies a partial contribution:
an omitted or `undefined` path keeps the lower default, and `null` is a value when
the param's type allows it. Sources apply in installation order and later sources
win. A source keeps its position when it updates, and removing one leaves the
others in place. `core.defaults.candidates` shows the composed result.

An installed source also moves
[`clearOnDefault`](/guide/query-state/navigation-options#clearondefault): a write
omits a param only when the complete resolved read is unchanged, so a write of the
static default persists while a differing source applies.

## Shaping reads and writes

`core.pipeline.define(stage, callback, options)` creates a descriptor, and the
setup returns it in `pipeline`. The core defines two stages:

| Stage | Reshapes |
| --- | --- |
| `read` | The value map the app reads, in one of three projections. |
| `write` | The complete explicit request before it is serialized to the URL. |

Callbacks are pure functions of their input. Reactivity is pull-based, so a callback
may *read* reactive sources and re-runs when they change, but must not mutate or
cause side effects.

```ts
import type { QueryCore } from '@vuqs/core'
import { codecs, defineQueryModule, defineQuerySchema } from '@vuqs/core'

export const pagedSchema = defineQuerySchema({ page: codecs.integer, q: codecs.string })

export const withClampedPage = defineQueryModule({
  states: (core: QueryCore<typeof pagedSchema>) => ({
    api: {},
    pipeline: [
      core.pipeline.define('write', values => ({
        ...values,
        page: values.page === undefined ? undefined : Math.max(1, values.page),
      })),
    ],
  }),
})
```

### Callback inputs and results

A callback receives the complete value map and a context, and returns the next map:

```ts
const hidePage = core.pipeline.define('read', (values, context) => {
  const { page: _page, ...rest } = values
  return context.query.preview === 'on' ? values : rest
}, { projection: 'resolved', presence: { optional: [['page']] } })
```

A read callback declares the `projection` it processes: `explicit` (decoded values),
`defaults` (the composed default candidates) or `resolved` (values after defaults).
A write callback processes the complete explicit request. Each callback receives the
output of the previous one, in `pre`, `default`, `post` and then installation order.
`enforce` selects the band.

The context is readonly:

| Property | Read | Write |
| --- | --- | --- |
| `stage` | `'read'` | `'write'` |
| `schema` | The binding's schema topology. | Same. |
| `query` | The query this evaluation reads. It is the live query, or an alternative being compared. | The effective query before the request, including earlier optimistic writes. It does not change while the callbacks run. |
| `projection` | The projection being processed. | none |
| `request` | none | The request as supplied: `mode`, `values`, and `origin`, `navigation` and `defaultPolicy` only when the caller set them. |

Callbacks must be synchronous and pure. The input and `context.request.values` are
readonly down through declared composed children, so assigning `values.record.a`
is a type error. Replace the containers you change and leave the rest alone: a
callback that changes nothing returns its input, and a spread that changes one
scalar passes every untouched array, JSON value, date and codec instance through
by reference. vuqs does not freeze or copy those values, so mutating one is a
violation of the contract that the types cannot catch.

### Presence

A callback can introduce absence only at the paths its `presence.optional` names,
and must define the paths in `presence.required`. A path is a tuple of logical
keys, such as `['record', 'a']`; it ignores URL prefixes, and it stops at atomic
params. A nested required path binds only while its parent is defined. A
supported `null` counts as defined.

vuqs checks the output of every descriptor before the next callback runs, and
reports the stage, projection and path that broke the contract, together with the
module name, installation and registration that created it. It never fills a
missing value to repair an output. An optional permission covers only its own
descriptor: a descriptor cannot remove a value because an earlier one declared the
path optional.

Navigation is not a pipeline stage. Reshape values with descriptors, encode them with
codecs, and perform navigation in an adapter or an action the module exposes.

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
subscribe to others' events with `on`:

```ts
// publisher
watch(active, next => core.hooks.emit('context:change', next))

// subscriber, in a different module
core.hooks.on('context:change', () => { /* reset per-context state */ })
```

Handlers run synchronously in subscription order, which follows installation order
across modules. Write handlers so the result does not depend on that order. A
throwing handler is isolated and logged: it never aborts the others or the emitter.
The public signals modules can emit or react to are listed in the
[Signals](/modules/signals) registry.

## Registering a module

An unregistered module is typed from its own callbacks. Register a module on
`QueryModuleRegistry` under a namespaced name to type its options and result per
call form: the API can depend on the bound param's value type, on the options the
module was configured with, and on the facade composing it.

Each registry entry declares a `states` and/or `state` signature. The parameter is
the options contract, and the return type is the setup specialized for the bound
schema and the configured options:

```ts
import type { ComputedRef } from 'vue'
import type { ModuleOptions, QueryCore, QueryStateSchema, QueryStateValueAt } from '@vuqs/core'
import { defineQueryModule } from '@vuqs/core'
import { computed } from 'vue'

declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'my-lib:explicit-value': {
      states: (options?: ModuleOptions<TOptions, { label?: string }>) => typeof withExplicitValue.definition.states<TSchema>
      state: () => typeof withExplicitValue.definition.state<TSchema>
    }
  }
}

export const withExplicitValue = defineQueryModule({
  name: 'my-lib:explicit-value',
  states: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    options?: { label?: string },
  ) => ({
    api: { label: options?.label, snapshot: core.state.explicitValues },
  }),
  state: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    key: keyof TSchema & string,
  ): { api: { explicitValue: ComputedRef<QueryStateValueAt<TSchema, 'value'> | undefined> } } => ({
    api: {
      explicitValue: computed(() => core.state.explicitValues.value[key] as QueryStateValueAt<TSchema, 'value'> | undefined),
    },
  }),
})
```

These signatures are type declarations; you do not implement them. `useQueryState`
resolves the registered `state` signature against its bound param, so
`ref.explicitValue` is typed as that param's value. Inside a `state` signature
`TSchema` is the single schema `{ value: … }`: read the bound value with
`QueryStateValueAt<TSchema, 'value'>`.

The factory keeps the actual callbacks on `definition`. `.use()` checks them against
the registered signature for the bound schema and options, so a callback whose
result differs from its declaration is a type error at the first or any later `.use()`.

`ModuleOptions<TOptions, TContract>` resolves to the contract while the factory is
inferring and to the supplied options once they are known, so a call is checked
against the contract and keeps its exact type. A module without options declares
`states: () => typeof withX.definition.states<TSchema>` and is called without
arguments.

### Facade-driven options

Options can depend on the facade that composes a module: grouped options on
`useQueryStates`, single options on `useQueryState`. Declare each signature with its
own options contract and the factory resolves the right shape per call form:

```ts
declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'my-lib:scope': {
      states: (options: ModuleOptions<TOptions, { label: string, keys: ReadonlyArray<keyof TSchema & string> }>) => typeof withScope.definition.states<TSchema>
      state: (options: ModuleOptions<TOptions, { label: string, include: boolean }>) => typeof withScope.definition.state<TSchema>
    }
  }
}
```

Composed inline, `.use` pins the facade, so the caller gets the matching option shape
and autocomplete:

```ts
useQueryStates(schema).use(withScope({ label: 'x', keys: ['q'] })) // grouped
useQueryState('q').use(withScope({ label: 'x', include: true })) // single
```

### Options that type a callback

`TInference` is a third registry parameter, inferred from the options independently
of `TOptions`. Use it when one option's type determines the type of a sibling
callback. `TOptions` keeps the complete configured object, including the literal
keys that declared effects read, while `TInference` carries only the part the
callback needs:

```ts
declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'my-lib:tabs': {
      states: (options: ModuleOptions<TOptions, {
        active: TInference & MaybeRefOrGetter<string>
        onChange?: (tab: TInference extends MaybeRefOrGetter<infer TTab extends string> ? TTab : string) => void
      }>) => typeof withTabs.definition.states<TSchema, typeof options>
    }
  }
}
```

With `active: ref<'a' | 'b'>('a')`, an unannotated `onChange: tab => …` receives
`'a' | 'b'`. [`withContext`](/modules/context) declares its `navigate` callback this way.
Modules that do not need the relationship ignore the parameter.

## Lifecycle and cleanup

A module's setup runs synchronously when `.use()` is called, inside an effect scope
that belongs to the binding. Resources it creates are released with the binding,
whichever scope is active when `.use()` runs:

- default sources and pipeline registrations it returns
- subscriptions made through `core.hooks.on` and `core.query.transactions.observe`
- Vue effects created during setup, such as `watch` and `onScopeDispose` callbacks

The installation becomes active as a whole. After setup returns, vuqs validates the
result, prepares the API and every registration, attaches the API, and then
activates the default sources and pipeline registrations in one step. A synchronous
observer that reacts to the new configuration, such as a `watch` with
`flush: 'sync'`, sees every source and descriptor together with the contributed
API, never a subset.

Cleanup is armed before setup runs. When the binding is disposed, the installation
leaves as a whole before any cleanup you registered with `onScopeDispose` runs, so a
callback that updates a source the module returned cannot change what the removed
installation contributes. Another installation that returns the same source keeps
observing it. Disposing twice is harmless.

You do not pair `hooks.on` or `transactions.observe` with `onScopeDispose`; the
disposers they return are optional and idempotent. A subscription made after setup,
for example from an action, is released with the module too, and one made through
the `core` of a disposed module does not stay active.

If installation fails before activation (an invalid result, a key collision, a
rejected descriptor or an API getter that throws), the API additions of the attempt
are removed, everything the module created is released, earlier modules and their
APIs stay intact, and no observer sees the attempted configuration. An error raised
by an observer or a read while the new configuration is being activated is not
rolled back: observers may already have seen the complete installation, and its
cleanup still runs with the binding.

## The returned API

The `api` object is merged onto the composable and widens its type. Keys must be
unique across modules: `.use()` throws if a module returns a key an earlier one
already provided.

```
[vuqs] module key "explicitValues" is already provided by an earlier module
```

Avoid the base API names (`values`, `patch`, `replace`, `clear`, `use`, `binding`)
and the keys of any module you expect to compose with.

Complete the `.use()` chain and capture its result before consuming the state.
`use` returns the composable with the accumulated API, so read and write through the
captured value:

```ts
const query = useQueryStates(schema)
  .use(withRuntimeDefaults())
  .use(withContext({ active, only: { category: ['products'] } }))

query.values.category
query.patch({ category: 'cpu' })
```

A reference retained before a `.use()` call observes the same live binding, but only
the returned value has the later modules' types.

## Logging

`createDebugLogger` writes into the debug stream. Target the module's `core.debug`
channel so its log events carry the same binding and runtime as the module's writes:

```ts
import { createDebugLogger } from '@vuqs/core'

const log = createDebugLogger('my-lib', { target: core.debug })
log.debug('installed for %d params', Object.keys(core.schema).length)
```

## Module example

A grouped module that records which params the app has written, exposes them, and
announces the first write through a signal:

```ts
// with-touched.ts
import type { QueryCore, QueryStateSchema } from '@vuqs/core'
import { defineQueryModule } from '@vuqs/core'
import { computed, shallowRef } from 'vue'

declare module '@vuqs/core' {
  interface QueryHooks {
    'touched:first': (key: string) => void
  }
}

export const withTouched = defineQueryModule({
  states: <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => {
    const touched = shallowRef<ReadonlySet<keyof TSchema & string>>(new Set())

    core.query.transactions.observe({
      start: ({ keys }) => {
        for (const key of keys) {
          if (!touched.value.has(key)) {
            touched.value = new Set([...touched.value, key])
            core.hooks.emit('touched:first', key)
          }
        }
      },
    })

    return {
      api: {
        touched: computed(() => [...touched.value]),
        isTouched: (key: keyof TSchema & string) => touched.value.has(key),
      },
    }
  },
})
```

```ts
const query = useQueryStates(schema).use(withTouched())

query.patch({ status: 'open' })
query.isTouched('status') // true
```

It reads only `core` and neither imports nor calls another module. The transaction
observer is released with the binding.

For complete contracts, consult [defineQueryModule](/api/authoring/define-query-module),
[QueryCore](/api/authoring/query-core), [QueryModuleRegistry](/api/authoring/query-module-registry),
[QueryHookBus](/api/authoring/query-hook-bus), and [QueryPipelineBus](/api/authoring/query-pipeline-bus).

## Nuxt

Auto-imports cover the published modules and `defineQueryModule`. Import an app
module directly, or register it under Nuxt's `imports` alongside the
[`@vuqs/core/modules` group](/nuxt/configuration#autoimports).
