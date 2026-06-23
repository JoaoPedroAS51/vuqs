# API reference

A complete, hand-curated reference for both packages. For task-oriented
walkthroughs, see the [Guide](/guide/introduction) and
[Store](/store/introduction) sections.

## Packages

| Package | Import | Purpose |
| --- | --- | --- |
| `vuqs` | `import { … } from 'vuqs'` | The core: codecs, composables, adapters, serializer. |
| `vuqs/adapters/vue-router` | `import { … } from 'vuqs/adapters/vue-router'` | The vue-router adapter. |
| `@vuqs/store` | `import { … } from '@vuqs/store'` | The three-state, context-aware store. |

## Reference pages

- **[codecs](/api/codecs)** — every built-in codec, `createCodec`, `.withDefault`.
- **[Composables](/api/composables)** — `useQueryState`, `useQueryStates`, `defineQueryState`, the adapter.
- **[Adapters](/api/adapters)** — `createVueRouterAdapter`, `provideVueRouterAdapter`, `QueryAdapter`.
- **[Serializer & pure functions](/api/serializer)** — `createSerializer` and the framework-free helpers.
- **[@vuqs/store](/api/store)** — `createQueryStore`, provide/inject, `QueryStore`.
- **[Types](/api/types)** — the exported type surface.

## Full export list

### `vuqs`

```ts
// Composables
export { useQueryState, useQueryStates }
export { provideQueryAdapter, useQueryAdapter }

// Fields & codecs
export { codecs, createCodec }
export { defineQueryState }

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
  QueryStateDefinition,
  QueryStateDefinitionInput,
  QueryStateDefinitionWithDefault,
  QueryStateRef,
  QueryStateSchema,
  QueryStateValues,
  QueryStateWriteValues,
  QueryStateValueOf,
  QueryStateRefValue,
  QueryStatesValues,
  QueryStatesActions,
  UseQueryStatesOptions,
  UseQueryStatesReturn,
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
}
```

### `vuqs/adapters/vue-router`

```ts
export { createVueRouterAdapter, provideVueRouterAdapter }
export type { VueRouterAdapterOptions }
```

### `@vuqs/store`

```ts
export { createQueryStore }
export { createQueryStoreKey, provideQueryStore, useQueryStore }
export type {
  CreateQueryStoreOptions,
  QueryStore,
  QueryStoreContext,
  QueryStoreKey,
}
```
