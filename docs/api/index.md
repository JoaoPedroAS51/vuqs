# API reference

Reference for every entry point. For usage guides, see the
[Guide](/guide/getting-started/installation) and
[Modules](/modules/) sections.

## Entry points

| Entry point | Import | Purpose |
| --- | --- | --- |
| `@vuqs/core` | `import { … } from '@vuqs/core'` | The core: codecs, composables, adapters, serializer. |
| `@vuqs/core/adapters/vue-router` | `import { … } from '@vuqs/core/adapters/vue-router'` | The vue-router adapter. |
| `@vuqs/core/modules` | `import { … } from '@vuqs/core/modules'` | [Composable modules](/modules/) applied with `.use()`. |
| `@vuqs/core/shared` | `import { … } from '@vuqs/core/shared'` | Helpers for [writing your own module](/modules/authoring). |
| `@vuqs/core/adapters/testing` | `import { … } from '@vuqs/core/adapters/testing'` | The [testing](/api/testing) adapter and helpers. |
| `@vuqs/core/testing` | `import { … } from '@vuqs/core/testing'` | Codec bijectivity [test helpers](/api/testing#iscodecbijective). |
| `@vuqs/core/debug` | `import '@vuqs/core/debug'` | Opt-in console [debug rendering](/guide/going-further/debugging): `enableDebug`/`disableDebug`. |
| `@vuqs/core/debug/console` | `import { … } from '@vuqs/core/debug/console'` | Side-effect-free console/performance reporter factories for framework integrations. |
| `@vuqs/core/debug-protocol` | `import type { … } from '@vuqs/core/debug-protocol'` | Type-only, experimental event protocol for tooling (`DebugEventMap`), governed by `DEBUG_PROTOCOL_VERSION`. |
| `@vuqs/nuxt` | `modules: ['@vuqs/nuxt']` | The [Nuxt module](/nuxt/getting-started): auto-imports and an app-wide adapter. |

## Reference pages

- **[Codecs](/api/codecs):** every built-in codec, `createCodec`, `.withDefault`.
- **[Composables](/api/composables):** `useQueryState`, `useQueryStates`, `queryParam`, the adapter.
- **[Adapters](/api/adapters):** `createVueRouterAdapter`, `provideVueRouterAdapter`, `QueryAdapter`.
- **[Serializer & pure functions](/api/serializer):** `createSerializer` and the framework-free helpers.
- **[Testing](/api/testing):** `createTestingAdapter`, `withVuqsTestingAdapter`, and codec bijectivity helpers.
- **[Debug events](/api/debug-events):** all structured event codes, summary policies, trace messages, and payload fields.
- **[Types](/api/types):** the exported type surface.

Each optional extension documents its own API on its page: the [Modules](/modules/)
section (`withRuntimeDefaults`, `withContext`, `withActiveParams`, `withStorage`,
and the [authoring](/modules/authoring) surface) and the
[@vuqs/nuxt](/nuxt/getting-started) section.

## Full export list

### `@vuqs/core`

```ts
// Composables
export { useQueryState, useQueryStates, toQueryRef, toQueryRefs }
export { installQueryAdapter, provideQueryAdapter, useQueryAdapter }

// Params & codecs
export { codecs, createCodec }
export { queryParam, defineQuerySchema }

// Module authoring
export { defineQueryModule }

// Serializer & pure functions
export { createSerializer }
export {
  parseQueryStates,
  serializeQueryStates,
  buildQuery,
  dropDefaults,
  getManagedKeys,
  omitManagedKeys,
  normalizeQueryStateSchema,
  assertUniquePaths,
}

// Path & equality helpers
export { getPath, setPath, deletePath, getQueryString, getQueryStringArray }
export { structuralEq }

// Engine (advanced)
export { createQueryStateEngine }

// Debug (observability): attach a reporter, retain history, read a snapshot, or write
// namespaced logs. See the debugging guide.
export {
  addDebugReporter, retainDebugHistory, getDebugChannel, getDebugSnapshot, isDebugArmed,
  createDebugLogger, DEBUG_PROTOCOL_VERSION,
}

// Types
export type {
  // Codecs
  Codec, CodecInput, CodecWithDefault,
  // Params
  DefinedQueryParam, DefinedQueryParamWithDefault,
  QueryParamBuilder, QueryParamBuilderWithDefault,
  QueryParamObjectBuilder, QueryParamObjectBuilderWithDefault,
  PrefixedQueryParamBuilder, QueryParamTransform,
  // Composables
  QueryStateRef, UseQueryStateReturn,
  QueryComposable, QueryStatesValues, QueryStatesActions,
  UseQueryStatesOptions, UseQueryStatesReturn, QueryRef, ToQueryRefs,
  QueryBinding, QueryBindingSource,
  // Schema
  QueryStateSchema, QueryStateSchemaInput, NormalizeQueryStateSchema,
  QueryStateValues, QueryStateWriteValues,
  QueryStateValueOf, QueryStateValueAt, QueryStateRefValue,
  // Modules
  QueryCore, QueryStatesModule, QueryStateModule,
  DefinedQueryModule, DefinedQueryStatesModule, DefinedQueryStateModule,
  QueryModuleFacade, QueryStatesFacadeModule, QueryStateFacadeModule, QueryFacadeModule,
  QueryModuleRegistry, QueryModuleName,
  QueryHooks, QueryHookBus,
  QueryPipeline, QueryPipelineBus, QueryPipelineStage, QueryValues, Enforce,
  QueryTransaction, QueryTransactionBus, QueryTransactionObserver,
  QueryTransactionDefaultPolicy, QueryTransactionOrigin, QueryTransactionRequest,
  // Adapter & navigation
  QueryAdapter, QueryAdapterDefaultOptions, NavigateOptions, QueryStateNavigate,
  ParsedQuery, ParsedQueryRaw, ParsedQueryValue,
  // Serializer
  Serializer, CreateSerializerOptions, SerializerStringify, SerializerParse,
  // Engine
  QueryStateEngine, QueryStateEngineOptions, QueryStateReads, QueryDefaultsBus, ResolvedQueryStateOptions,
  // Debug (stable observation surface)
  DebugEvent, DebugContext, DebugEmissionContext, DebugLevel, Reporter, DebugChannelHandle,
  AddReporterOptions, RetainHistoryOptions, DebugSnapshot, DebugSnapshotKind, DebugLogger,
}
```

### `@vuqs/core/debug`

```ts
// Side-effect import reads the versioned `vuqs:debug` browser configuration.
import '@vuqs/core/debug'
export {
  enableDebug, disableDebug, addConsoleDebugReporter,
  createConsoleReporter, createPerformanceReporter,
  readStoredConsoleDebugConfig, VUQS_DEBUG_CONFIG_VERSION, VUQS_DEBUG_STORAGE_KEY,
}
export type {
  EnableDebugOptions, ConsoleReporterOptions, PerformanceReporterOptions,
  StoredDebugConfigV1, StoredConsoleDebugConfig, StoredConsoleDebugResolution,
  StoredConsoleReporterOptions,
  StoredDebugEventFilter, StoredDebugEventSelector, StoredDebugPayloadMode,
}
```

### `@vuqs/core/debug/console`

```ts
// Pure entry: importing it does not attach a reporter or read browser storage.
export {
  addConsoleDebugReporter, createConsoleReporter, createPerformanceReporter,
  readStoredConsoleDebugConfig, VUQS_DEBUG_CONFIG_VERSION, VUQS_DEBUG_STORAGE_KEY,
}
export type {
  AddConsoleDebugReporterOptions, ConsoleReporterOptions, PerformanceReporterOptions,
  StoredDebugConfigV1, StoredConsoleDebugConfig, StoredConsoleDebugResolution,
  StoredConsoleReporterOptions,
  StoredDebugEventFilter, StoredDebugEventSelector, StoredDebugPayloadMode,
}
```

### `@vuqs/core/debug-protocol`

```ts
// Type-only and EXPERIMENTAL: the strict event protocol for first-party tooling,
// governed by DEBUG_PROTOCOL_VERSION (from @vuqs/core), not by normal semver.
export type {
  DebugEventMap, DebugEventCode, DebugScope, LogDebugCode, WarnDebugCode,
  KnownDebugEvent, DebugSnapshot, DebugSnapshotByKind,
  EngineSnapshot, QueueSnapshot, StorageSnapshot,
}
```

### `@vuqs/core/adapters/vue-router`

```ts
export { createVueRouterAdapter, provideVueRouterAdapter }
export type { VueRouterAdapterOptions }
```

### `@vuqs/core/modules`

```ts
export { createWebStorage, withActiveParams, withContext, withRuntimeDefaults, withStorage }
export type {
  ActiveParamsOptions, ActiveParamsStatesApi, ActiveParamsStateApi,
  ContextBaseOptions, ContextNavigate,
  ContextStatesApi, ContextStateApi,
  QueryStatesContextOptions, QueryStateContextOptions,
  RuntimeDefaultsStatesApi, RuntimeDefaultsStateApi,
  Awaitable, QueryStorage, StoredQuerySnapshot,
  StorageOptions, StorageRestorePolicy, StorageStatus, StorageControls, StorageApi,
}
```

### `@vuqs/core/shared`

```ts
// Helpers for writing your own module
export { pickBy, omitBy, definedOnly, toReadonlyState }
```

### `@vuqs/core/adapters/testing`

```ts
export { createTestingAdapter, withVuqsTestingAdapter }
export type { TestingAdapter, TestingAdapterOptions, UrlUpdateEvent, OnUrlUpdateFunction }
```

### `@vuqs/core/testing`

```ts
export { isCodecBijective, testSerializeThenParse, testParseThenSerialize }
```

### `@vuqs/nuxt`

```ts
// Registered in nuxt.config: modules: ['@vuqs/nuxt']
export type { AdapterOptions, AutoImportsOptions, ModuleOptions }
```
