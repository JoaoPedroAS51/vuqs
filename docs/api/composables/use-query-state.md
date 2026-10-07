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
function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T, object, T>
function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T | undefined, object, T>

// String shorthand (no codec)
function useQueryState(path: string, options: StringOptions & { defaultValue: string }): UseQueryStateReturn<string, object, string>
function useQueryState(path: string, options?: StringOptions): UseQueryStateReturn<string | undefined, object, string>

// With a pre-built param
function useQueryState<T>(param: DefinedQueryParamWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T, object, T>
function useQueryState<T>(param: DefinedQueryParam<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T | undefined, object, T>
```

`StringOptions` is an illustrative local alias for
`UseQueryStatesOptions & { parse?: never, serialize?: never }`; it is not exported.
The third `UseQueryStateReturn` argument is the decoded value type used to infer
module APIs, independently of whether the ref can read `undefined`.

## Parameters

- `path: string`
  - The query key to bind. Use a dot-path (`'filters.sort'`) for [nested keys](/guide/query-state/defining-params#nested-keys).
  - Pass either `path` (with an optional `codec`) **or** a pre-built `param`.
- `codec?: Codec<T>`
  - How the value parses and serializes. Defaults to `codecs.string`.
  - A codec built with `.withDefault(v)` narrows the ref to `T` and keeps the default out of the URL.
- `param?: DefinedQueryParam<T>`
  - A param from [`queryParam`](/api/params/query-param), passed in place of `path` + `codec`.
- `options?: UseQueryStatesOptions`
  - Per-instance navigation and write behavior. See [`UseQueryStatesOptions`](/api/composables/use-query-states#usequerystatesoptions).
  - String shorthand only: pass `{ defaultValue: string }` for a plain string key. `defaultValue` is string-only; for other types pass `codecs.X.withDefault(...)`.

## Return value

- `state: UseQueryStateReturn<T>`
  - A writable computed ref (`QueryStateRef<T>`) with a `.use()` for modules.
    Reads are `T` when the codec or param carries a default, otherwise `T | undefined`.
  - `state.value: T`
    - Read or write the value; `v-model` binds here. Assigning `undefined` clears a param whose type includes it.
  - `state.set(value, options?): void`
    - Write with per-call [navigation options](/guide/query-state/navigation-options).
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
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

## UseQueryStateReturn

```ts
type UseQueryStateReturn<T, TApi = object, TValue = T> = QueryStateRef<T> & TApi & {
  use: {
    <TStateApi>(
      module: QueryFacadeModule<'state', SingleQueryStateSchema<TValue>, any, TStateApi>,
    ): UseQueryStateReturn<T, TApi & TStateApi, TValue>
    <TModule extends QueryStateNameModule<any>>(
      module: TModule,
    ): UseQueryStateReturn<T, TApi & QueryStateNameApiOf<TModule, SingleQueryStateSchema<TValue>>, TValue>
    <TAdded>(
      module: QueryStateFacadeModule<'state', TAdded>,
    ): UseQueryStateReturn<T, TApi & TAdded, TValue>
    <TAdded>(
      module: DefinedQueryStateModule<TAdded>,
    ): UseQueryStateReturn<T, TApi & TAdded, TValue>
  }
}
```

The module markers and supporting single-schema types are internal declarations.
See [Module types](/api/authoring/define-query-module#module-types) for the full composition contract.

## Related guide

[Query state](/guide/query-state/use-query-state).
