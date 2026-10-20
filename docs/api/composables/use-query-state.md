# useQueryState <Badge type="info" text="@vuqs/core" />

Binds a single query key to a writable ref.

A [query adapter](/api/adapters/query-adapter) must be provided in the current
Vue injection context. The call throws when no adapter is available.

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

const page = useQueryState('page', codecs.integer.withDefault(1))

page.value++ // ?page=2
page.set(1, { history: 'push' }) // push a history entry
page.clear() // back to the default
```

## Type

```ts
// With a codec
function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<DefinedQueryParam<T, T, T, true>>
function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<DefinedQueryParam<T, T, T, false>>

// String shorthand (no codec)
function useQueryState(path: string, options: StringOptions & { defaultValue: string }): UseQueryStateReturn<DefinedQueryParam<string, string, string, true>>
function useQueryState(path: string, options?: StringOptions): UseQueryStateReturn<DefinedQueryParam<string, string, string, false>>

// With a pre-built param
function useQueryState<TParam extends AnyDefinedQueryParam>(param: TParam, options?: UseQueryStatesOptions): UseQueryStateReturn<TParam>
```

`StringOptions` is an illustrative local alias for
`UseQueryStatesOptions & { parse?: never, serialize?: never }`; it is not exported.
`UseQueryStateReturn` keeps the bound param, so the ref reads its resolved value,
writes its explicit value, and module APIs infer from the same param.

## Parameters

- `path: string`
  - The query key to bind. Use a dot-path (`'filters.sort'`) for [nested keys](/guide/query-state/defining-params#nested-keys).
  - Pass either `path` (with an optional `codec`) **or** a pre-built `param`.
- `codec?: Codec<T>`
  - How the value parses and serializes. Defaults to `codecs.string`.
  - A codec built with `.withDefault(v)` narrows the ref to `T` and keeps the default out of the URL.
- `param?: TParam`
  - A param from [`queryParam`](/api/params/query-param), passed in place of `path` + `codec`.
- `options?: UseQueryStatesOptions`
  - Per-instance navigation and write behavior. See [`UseQueryStatesOptions`](/api/composables/use-query-states#usequerystatesoptions).
  - String shorthand only: pass `{ defaultValue: string }` for a plain string key. `defaultValue` is string-only; for other types pass `codecs.X.withDefault(...)`.

## Return value

- `state: UseQueryStateReturn<TParam>`
  - A writable computed ref (`QueryStateRef`) with a `.use()` for modules.
    Reads are the resolved value, which excludes `undefined` when the param guarantees one.
  - `state.value`
    - Read the resolved value or write the explicit value; `v-model` binds here. Assigning `undefined` clears a param whose read type includes it.
  - `state.set(value, options?): void`
    - Write the explicit value with per-call [write options](/api/composables/use-query-states#querywriteoptions). A composed param accepts a partial object: omitted children keep resolving from their defaults.
  - `state.clear(options?): void`
    - Remove the key from the URL, reverting to its default.
  - `state.use(module): UseQueryStateReturn<…>`
    - Compose a single-param [module](/modules/) onto the ref, merging its API and
      widening the type. Returns the same ref object.

## Behavior

::: warning `.set` / `.clear` aren't reachable in templates
Vue auto-unwraps a top-level ref in templates, so call them from a function in
`<script setup>`. See [the guide](/guide/query-state/use-query-state#using-it-in-templates).
:::

## QueryStateRef

```ts
interface QueryStateRef<TRead, TWrite = TRead> extends WritableComputedRef<TRead, TWrite> {
  set: (value: TWrite, options?: QueryWriteOptions) => void
  clear: (options?: QueryWriteOptions) => void
}
```

## UseQueryStateReturn

```ts
type UseQueryStateReturn<
  TParam extends AnyDefinedQueryParam,
  TApi = object,
  TDescriptors extends readonly unknown[] = [],
> = QueryStateRef<QueryStateReadOf<TParam, TDescriptors>, QueryStateRefInput<TParam>> & TApi & {
  use: <TModule extends QueryStateUsable<SingleParamSchema<TParam>>>(
    module: TModule & VerifiedStateModule<TModule, SingleParamSchema<TParam>>,
  ) => UseQueryStateReturn<
    TParam,
    TApi & StateModuleApi<TModule, SingleParamSchema<TParam>>,
    [...TDescriptors, ...StateModulePipeline<TModule, SingleParamSchema<TParam>>]
  >
}

type QueryStateReadOf<TParam extends AnyDefinedQueryParam, TDescriptors extends readonly unknown[]>
  = TDescriptors extends readonly [] ? QueryStateRefValue<TParam> : /* the base read after the ordered presence effects */
```

`TApi` is the API the applied modules contributed and `TDescriptors` the pipeline descriptors they installed. The ref reads the value after the modules' presence effects and writes the param's explicit value. `use` returns a new value, so capture the end of the chain; an earlier reference keeps its earlier types.

The module markers and supporting single-schema types are internal declarations.
See [Module types](/api/authoring/define-query-module#module-types) for the full composition contract.

## Related guide

[Query state](/guide/query-state/use-query-state).
