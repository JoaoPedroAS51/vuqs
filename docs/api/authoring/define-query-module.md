# defineQueryModule <Badge type="info" text="@vuqs/core" />

Builds a factory that contributes API, default sources and pipeline registrations to grouped state, single state, or both.

## Usage

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

## Type

```ts
// Registered: `name` selects a QueryModuleRegistry entry
function defineQueryModule<const TName extends QueryModuleName, TState extends ContextualState<NoInfer<TName>>>(
  definition: { name: TName, states?: undefined, state: TState },
): QueryModuleFactory<TName, { state: TState }>

function defineQueryModule<const TName extends QueryModuleName, TStates extends ContextualStates<NoInfer<TName>>>(
  definition: { name: TName, states: TStates, state?: undefined },
): QueryModuleFactory<TName, { states: TStates }>

function defineQueryModule<
  const TName extends QueryModuleName,
  TStates extends ContextualStates<NoInfer<TName>>,
  TState extends ContextualState<NoInfer<TName>>,
>(
  definition: { name: TName, states: TStates, state: TState },
): QueryModuleFactory<TName, { states: TStates, state: TState }>

// Plain: options and results come from the callbacks
function defineQueryModule<TStatesResult extends QueryModuleResult, TStateResult extends QueryModuleResult, TOptions = void>(
  definition: {
    name?: undefined
    states: (core: QueryCore<any>, options: TOptions) => TStatesResult
    state: (core: QueryCore<any>, key: string, options: TOptions) => TStateResult
  },
): PlainQueryModuleFactory<TStatesResult, TStateResult, TOptions, true, true>

function defineQueryModule<TStatesResult extends QueryModuleResult, TOptions = void>(
  definition: {
    name?: undefined
    states: (core: QueryCore<any>, options: TOptions) => TStatesResult
    state?: undefined
  },
): PlainQueryModuleFactory<TStatesResult, QueryModuleResult, TOptions, true, false>

function defineQueryModule<TStateResult extends QueryModuleResult, TOptions = void>(
  definition: {
    name?: undefined
    states?: undefined
    state: (core: QueryCore<any>, key: string, options: TOptions) => TStateResult
  },
): PlainQueryModuleFactory<QueryModuleResult, TStateResult, TOptions, false, true>
```

The registered forms contextualize `states` and `state` from the registry entry named by `name`: inline callbacks receive typed `core`, `key` and `options` without annotations or generics. The factory captures each callback as written and exposes it on `definition`. The plain forms type the factory from the callbacks.

`ContextualStates` and `ContextualState` are internal supporting types, not package exports. They describe the setup callbacks accepted by the registered overloads:

```ts
type ContextualStates<TName extends QueryModuleName> = <TSchema extends QueryStateSchema, const TOptions = unknown>(
  core: QueryCore<TSchema>,
  options: TOptions & QueryModuleStatesContract<TName, TSchema>,
) => QueryModuleResult

type ContextualState<TName extends QueryModuleName> = <TSchema extends QueryStateSchema, const TOptions = unknown>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
  options: TOptions & QueryModuleStateContract<TName, TSchema>,
) => QueryModuleResult
```

## Parameters

| Property | Type | Behavior |
| --- | --- | --- |
| `name` | `QueryModuleName` | Optional registry name. The registered signatures determine options and result. |
| `states` | `(core, options) => result` | Grouped setup. Omit for a single-only module. |
| `state` | `(core, key, options) => result` | Single-param setup. Omit for a grouped-only module. |

Provide at least one setup. A setup returns a [`QueryModuleResult`](#querymoduleresult).

## Return value

A factory, called to produce the module passed to `.use()`. Calling the factory captures the options and never runs a setup. `.use()` runs the setup of the receiving facade once, inside an effect scope owned by the binding, then installs what it returned. The factory's `definition` property holds the callbacks as written.

Applying a module without the receiving facade's setup throws. A setup that returns no `api` object, a key already present on the base API or another module, or an invalid descriptor throws, and everything the module created is released while earlier modules stay intact.

## Factory call forms

| Call | Facade and inference |
| --- | --- |
| `factory(options?)` | Adaptive. Inline `.use()` supplies the facade and schema. |
| `factory(schema, options)` | Grouped. Uses a normalized schema for option and result inference. |
| `factory(param, options)` | Single. Infers from the param's value contract. |
| `factory(path, options)` | Single. Selects the single option shape. |

The target arguments provide type information and select a facade. The composable applying the module supplies the actual core and bound key. A registered factory keeps the configured options and the inference source independent (`TOptions` and `TInference`) until `.use()` verifies the callbacks against the registry signature.

## QueryModuleResult

```ts
interface QueryModuleResult<TApi extends object = object> {
  api: TApi
  defaults?: readonly QueryDefaultSource[]
  pipeline?: readonly [QueryModulePipelineDescriptor?, ...QueryModulePipelineDescriptor[]]
}

type QueryDefaultSource = MaybeRefOrGetter<Readonly<Record<string, unknown>> | undefined>
```

| Member | Contract |
| --- | --- |
| `api` | Merged onto the composable. A key already provided throws. |
| `defaults` | Reactive sources of partial default contributions, installed in order above the static defaults. A missing or `undefined` path keeps the lower default. |
| `pipeline` | Descriptors created with `core.pipeline.define`. Only returned descriptors are installed. |

The core assigns each installed source and descriptor a registration identity and its module installation, and keeps the declared `name` for diagnostics.

## Module types

| Type | Contract |
| --- | --- |
| `QueryStatesModule<TSchema, TResult>` | Grouped setup `(core) => result`. |
| `DefinedQueryStateModule<TResult>` | Packaged single setup. |
| `QueryModuleFacade` | `'state'` or `'states'`. |
| `QueryStatesFacadeModule` / `QueryStateFacadeModule` / `QueryFacadeModule` | Plain modules carrying a type-only facade marker. |
| `QueryRegisteredStatesModule` / `QueryRegisteredStateModule` / `QueryRegisteredDualModule` | Registered modules carrying the name, options, inference source and callbacks. |
| `QueryModuleFactory<TName, TProducers>` | Factory returned for a registered module. |
| `PlainQueryModuleFactory<TStatesResult, TStateResult, TOptions, THasStates, THasState>` | Factory returned for a plain module. |
| `QueryModuleProducers` | The callbacks held by `definition`. |

The remaining exported types, such as the verification and lookup aliases, support `.use()` and are listed under [registry lookups](/api/authoring/query-module-registry#registry-lookups).

## Related guide

[Writing a module](/modules/authoring).
