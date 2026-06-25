# API reference

A complete, hand-curated reference for every entry point. For task-oriented
walkthroughs, see the [Guide](/guide/introduction) and
[Modules](/modules/introduction) sections.

## Entry points

| Entry point | Import | Purpose |
| --- | --- | --- |
| `vuqs` | `import { … } from 'vuqs'` | The core: codecs, composables, adapters, serializer. |
| `vuqs/adapters/vue-router` | `import { … } from 'vuqs/adapters/vue-router'` | The vue-router adapter. |
| `vuqs/modules` | `import { … } from 'vuqs/modules'` | [Composable modules](/modules/introduction) applied with `.use()`. |
| `vuqs/shared` | `import { … } from 'vuqs/shared'` | Helpers for [writing your own module](/modules/authoring). |
| `vuqs/adapters/testing` | `import { … } from 'vuqs/adapters/testing'` | The [testing](/api/testing) adapter and helpers. |
| `vuqs/testing` | `import { … } from 'vuqs/testing'` | Codec bijectivity [test helpers](/api/testing#vuqs-testing). |
| `@vuqs/nuxt` | `modules: ['@vuqs/nuxt']` | The [Nuxt module](/nuxt/introduction): auto-imports + the adapter out of the box. |

## Reference pages

- **[codecs](/api/codecs)** — every built-in codec, `createCodec`, `.withDefault`.
- **[Composables](/api/composables)** — `useQueryState`, `useQueryStates`, `defineQueryParam`, the adapter.
- **[Adapters](/api/adapters)** — `createVueRouterAdapter`, `provideVueRouterAdapter`, `QueryAdapter`.
- **[Serializer & pure functions](/api/serializer)** — `createSerializer` and the framework-free helpers.
- **[Testing](/api/testing)** — `createTestingAdapter`, `withVuqsTestingAdapter`, and codec bijectivity helpers.
- **[Types](/api/types)** — the exported type surface.

Each optional extension documents its own API on its page: the
[Modules](/modules/introduction) section (`withRuntimeDefaults`, `withContext`, and the
[authoring](/modules/authoring) surface) and the [@vuqs/nuxt](/nuxt/introduction)
section.

## Full export list

### `vuqs`

```ts
// Composables
export { useQueryState, useQueryStates, toQueryRefs }
export { installQueryAdapter, provideQueryAdapter, useQueryAdapter }

// Params & codecs
export { codecs, createCodec }
export { defineQueryParam }

// Serializer & pure functions
export { createSerializer }
export {
  parseQueryStates,
  serializeQueryStates,
  buildQuery,
  dropDefaults,
  getManagedKeys,
  omitManagedKeys,
  assertUniquePaths,
}

// Path & equality helpers
export { getPath, setPath, deletePath, getQueryString, getQueryStringArray }
export { structuralEq }

// Engine (advanced)
export { createQueryStateEngine }

// Types
export type {
  Codec,
  CodecInput,
  CodecWithDefault,
  QueryParamDefinition,
  QueryParamDefinitionInput,
  QueryParamDefinitionWithDefault,
  QueryStateRef,
  QueryStateSchema,
  QueryStateValues,
  QueryStateWriteValues,
  QueryStateValueOf,
  QueryStateRefValue,
  QueryStatesValues,
  QueryStatesActions,
  ToQueryRefs,
  UseQueryStatesOptions,
  UseQueryStatesReturn,
  QueryComposable,
  QueryCore,
  QueryModule,
  QueryHooks,
  QueryHookBus,
  QueryPipeline,
  QueryPipelineBus,
  QueryPipelineStage,
  QueryValues,
  Enforce,
  QueryAdapter,
  QueryAdapterDefaultOptions,
  NavigateOptions,
  QueryStateNavigate,
  ParsedQuery,
  ParsedQueryRaw,
  ParsedQueryValue,
  Serializer,
  CreateSerializerOptions,
  SerializerStringify,
  SerializerParse,
  QueryStateEngine,
  QueryStateEngineOptions,
  QueryStateReads,
  QueryDefaultsBus,
  ResolvedQueryStateOptions,
}
```

### `vuqs/adapters/vue-router`

```ts
export { createVueRouterAdapter, provideVueRouterAdapter }
export type { VueRouterAdapterOptions }
```

### `vuqs/modules`

```ts
export { withContext, withRuntimeDefaults }
export type { ContextApi, ContextOptions, RuntimeDefaultsApi }
```

### `vuqs/shared`

```ts
// Helpers for writing your own module
export { pickBy, omitBy, definedOnly, toReadonlyState }
export type { NoInferType }
```

### `vuqs/adapters/testing`

```ts
export { createTestingAdapter, withVuqsTestingAdapter, resetQueues }
export type { TestingAdapter, TestingAdapterOptions, UrlUpdateEvent, OnUrlUpdateFunction }
```

### `vuqs/testing`

```ts
export { isCodecBijective, testSerializeThenParse, testParseThenSerialize }
```

### `@vuqs/nuxt`

```ts
// Registered in nuxt.config: modules: ['@vuqs/nuxt']
export type { AdapterOptions, AutoImportsOptions, ModuleOptions }
```
