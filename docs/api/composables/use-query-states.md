# useQueryStates <Badge type="info" text="@vuqs/core" />

Binds a [schema](/guide/query-state/concepts#schema-a-map-of-params) of params to a
reactive value map plus batch writers.

A [query adapter](/api/adapters/query-adapter) must be provided in the current
Vue injection context. The call throws when no adapter is available.

## Usage

```ts
import { codecs, useQueryStates } from '@vuqs/core'

const { values, patch, clear } = useQueryStates({
  q: codecs.string.withDefault(''),
  page: codecs.integer.withDefault(1),
})

values.q = 'laptop' // ?q=laptop
patch({ q: 'phone', page: 1 }) // one navigation
clear() // reset all
```

## Type

```ts
function useQueryStates<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options?: UseQueryStatesOptions,
): QueryComposable<NormalizeQueryStateSchema<TSchema>, UseQueryStatesReturn<NormalizeQueryStateSchema<TSchema>>>
```

## Parameters

- `schema: TSchema`
  - A map of logical name to a **codec** (the map key becomes the query key) or a
    param from [`queryParam`](/api/params/query-param) (for a custom key, object param, or
    modifier).
- `options?: UseQueryStatesOptions`
  - Per-instance navigation and write behavior, shared by every param in the
    schema. See [`UseQueryStatesOptions`](/api/composables/use-query-states#usequerystatesoptions).

## Return value

- `query: QueryComposable<NormalizeQueryStateSchema<TSchema>, UseQueryStatesReturn<NormalizeQueryStateSchema<TSchema>>>`
  - The reactive values, batch writers, binding and module composition API.

| Property | Description |
| --- | --- |
| `values` | Reactive, writable param values. Defaulted params read as `T`; others read as `T \| undefined`. Replace arrays and objects to navigate; in-place mutations do not navigate. |
| `patch(values, options?)` | Partial atomic write. Omitted params are preserved; explicit `undefined` clears. |
| `replace(values, options?)` | Whole-state atomic write. Omitted or explicitly `undefined` params are cleared. |
| `clear(options?)` | Resets every param to its default as one atomic transaction. |
| `binding` | The schema-typed root used by `toQueryRef` and `toQueryRefs`. |
| `use(module)` | Composes a [module](/modules/) and widens the returned API. |

Batch writes may share a navigation with other writes in the same scheduling window.

The grouped `values` map drops the per-field `.set`/`.clear` that
[`useQueryState`](/api/composables/use-query-state) gives a single param. Use
[`toQueryRefs`](/api/composables/to-query-refs) to create one ref per field.

**Throws** if two params declare the same query path, or if no adapter has been
provided (see [`provideQueryAdapter`](/api/adapters/provide-query-adapter)).

## UseQueryStatesOptions

Per-instance behavior for both composables. The query source and URL writer come
from the [adapter](/api/adapters/query-adapter), never from here.

```ts
interface UseQueryStatesOptions extends NavigateOptions {
  throttleMs?: number
  clearOnDefault?: boolean
}
```

### Properties

| Property | Type | Description |
| --- | --- | --- |
| `history` | `'replace' \| 'push'` | Optional. Defaults to `'replace'`. Push or replace a history entry. |
| `scroll` | `boolean` | Optional. Defaults to the adapter's behavior. Forwarded to the adapter. |
| `throttleMs` | `number` | Optional. Defaults to a microtask. Coalesce writes within this many milliseconds. |
| `clearOnDefault` | `boolean` | Optional. Defaults to `true`. Drop values equal to their resolved defaults. |

See [Navigation & options](/guide/query-state/navigation-options) for behavior and
precedence.

## QueryStatesValues

```ts
type QueryStatesValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRefValue<TSchema[Key]>
}
```

## QueryStatesActions

```ts
interface QueryStatesActions<TSchema extends QueryStateSchema> {
  patch: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  replace: (values: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

## UseQueryStatesReturn

```ts
interface UseQueryStatesReturn<TSchema extends QueryStateSchema>
  extends QueryStatesActions<TSchema>, QueryBindingSource<TSchema> {
  values: QueryStatesValues<TSchema>
}
```

## QueryComposable

```ts
type QueryComposable<TSchema extends QueryStateSchema, TApi> = TApi & {
  use: {
    <TAdded>(module: QueryStatesFacadeModule<'states', TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
    <TAdded>(module: QueryStatesModule<TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
  }
}
```

The module markers and supporting single-schema types are internal declarations.
See [Module types](/api/authoring/define-query-module#module-types) for the full composition contract.

## Related guide

[Query state](/guide/query-state/use-query-states).
