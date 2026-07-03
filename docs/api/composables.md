# API: composables

The reactive composables — bind query params to refs — plus the functions that
wire up the [adapter](/api/adapters) they read and write through.

## useQueryState <Badge type="info" text="@vuqs/core" />

Binds a single query key to a writable ref.

### Signature

```ts
function useQueryState<T>(
  path: string,
  codec?: Codec<T>,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<T>
```

### Overloads

```ts
// With a codec (canonical)
function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T>
function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T | undefined>

// String shorthand (no codec)
function useQueryState(path: string, options: StringOptions & { defaultValue: string }): UseQueryStateReturn<string>
function useQueryState(path: string, options?: StringOptions): UseQueryStateReturn<string | undefined>

// With a pre-built param definition
function useQueryState<T>(definition: DefinedQueryParamWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T>
function useQueryState<T>(definition: DefinedQueryParam<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T | undefined>
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `path` | `string` | The query key. Use a dot-path (`'filters.sort'`) for [nested keys](/guide/nested-keys). |
| `codec` | `Codec<T>` | How the value is parsed and serialized. Defaults to `codecs.string`. A `.withDefault()` codec narrows the ref to non-nullable. |
| `definition` | `DefinedQueryParam<T>` | A pre-built param from [`queryParam`](#queryparam), passed in place of `path` + `codec`. |
| `options` | `UseQueryStatesOptions` | Per-instance behavior. Optional when an [adapter](/api/adapters) is provided. |

`StringOptions` is `UseQueryStatesOptions` with `parse`/`serialize` forbidden, so
a codec routes to the codec overloads. `defaultValue` is **string-only** — for
other types pass `codecs.X.withDefault(...)`.

### Returns

`UseQueryStateReturn<T>` — a writable ref augmented with methods:

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}

type UseQueryStateReturn<T, TApi = object> = QueryStateRef<T> & TApi & {
  use: <TStateApi>(
    module: DefinedQueryStateModule<TStateApi>,
  ) => UseQueryStateReturn<T, TApi & TStateApi>
}
```

- `.value` — read/write; assigning `undefined` clears a nullable param.
- `.set(value, options?)` — write with per-call [navigation options](/guide/navigation-options).
- `.clear(options?)` — remove the key (revert to its default).
- `.use(module)` — compose a single-compatible module onto the same ref object,
  preserving Vue ref identity and widening the returned type.

Call `.use()` synchronously during setup or another active Vue effect scope so
module cleanup registered with `onScopeDispose` is tied to the caller's lifecycle.

### Example

```ts
import { codecs, useQueryState } from '@vuqs/core'

const page = useQueryState('page', codecs.integer.withDefault(1))

page.value++                    // ?page=2
page.set(1, { history: 'push' }) // push a history entry
page.clear()                    // back to the default
```

::: warning `.set` / `.clear` aren't reachable in templates
Vue auto-unwraps a top-level ref in templates, so call them from a function in
`<script setup>`. See [the guide](/guide/use-query-state#using-it-in-templates).
:::

## useQueryStates <Badge type="info" text="@vuqs/core" />

Binds a [schema](/guide/concepts#schema-a-map-of-params) of params to a reactive
value map plus batch writers.

### Signature

```ts
function useQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options?: UseQueryStatesOptions,
): UseQueryStatesReturn<TSchema>
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `schema` | `TSchema` | A map of logical name → [param definition](#queryparam). |
| `options` | `UseQueryStatesOptions` | Per-instance behavior. Optional when an adapter is provided. |

### Returns

`UseQueryStatesReturn<TSchema>`:

```ts
interface UseQueryStatesReturn<TSchema> {
  values: { [K in keyof TSchema]: QueryStateRefValue<TSchema[K]> }
  setValues: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

- `values` — reactive and writable; `values.k` is the value, not a ref. Params
  with a default are non-nullable. **Replace, don't mutate** arrays/objects.
- `setValues(values, options?)` — batch write; `null` clears, `undefined`/absent
  skips, a value sets. Coalesced into one navigation.
- `clear(options?)` — reset every param.

The grouped `values` map drops the per-field `.set`/`.clear` that
[`useQueryState`](#usequerystate) gives a single param. Explode it with
[`toQueryRefs`](#toqueryrefs) to get them back per field.

**Throws** if two params declare the same query path, or if no adapter has been
provided (see [`provideQueryAdapter`](#providequeryadapter)).

### Example

```ts
import { codecs, queryParam, useQueryStates } from '@vuqs/core'

const { values, setValues, clear } = useQueryStates({
  q: queryParam('q', codecs.string.withDefault('')),
  page: queryParam('page', codecs.integer.withDefault(1)),
})

values.q = 'laptop'              // ?q=laptop
setValues({ q: 'phone', page: 1 }) // one navigation
clear()                          // reset all
```

::: tip `.use(module)`
`useQueryStates` returns a [`QueryComposable`](/modules/introduction#the-use-model) —
call `.use()` to layer modules like [`withRuntimeDefaults`](/modules/runtime-defaults) and
[`withContext`](/modules/context) onto it.

Modules authored with [`defineQueryModule`](/modules/authoring) can also expose a
single-param projection for [`useQueryState`](#usequerystate).
:::

## toQueryRefs <Badge type="info" text="@vuqs/core" />

Explodes a value map into one ref per field, the way Pinia's `storeToRefs` explodes
a store. Use it to recover the per-field `.set`/`.clear` that the grouped `values`
map drops, or to pass a single field around. For one param from the start, reach for
[`useQueryState`](#usequerystate) instead.

### Signature

```ts
function toQueryRefs<T extends object>(map: T): ToQueryRefs<T>
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `map` | `T` | A value map from [`useQueryStates`](#usequerystates) (`values`) or a module (`selected`/`defaults`). |

### Returns

`ToQueryRefs<T>` — one ref per field, keyed by param:

- The writable [`values`](#usequerystates) map explodes into a
  [`QueryStateRef`](#usequerystate) per field: writable `.value`, plus `.set(value,
  options?)` and `.clear(options?)` for per-call navigation options. Assigning
  `undefined` clears, like `.clear()`.
- A read-only map (`selected`/`defaults`) explodes into a `ComputedRef` per field.

The helper carries no behavior of its own: writes route back through the source
map. A ref off the effective `values` under [`withRuntimeDefaults`](/modules/runtime-defaults)
clears against the *effective* default, exactly as `values.x = …` would.

### Example

```ts
import { codecs, queryParam, toQueryRefs, useQueryStates } from '@vuqs/core'

const { values } = useQueryStates({
  q: queryParam('q', codecs.string),
  sort: queryParam('sort', codecs.literal(['asc', 'desc'] as const)),
})

const { q, sort } = toQueryRefs(values)

q.value = 'sale'                  // write
sort.set('desc', { history: 'push' }) // per-call options
q.clear()                         // remove ?q
```

::: tip Writable vs read-only
The writable `values` map explodes into writable refs with `.set`/`.clear`; a
read-only map (`selected`/`defaults`) explodes into read-only refs. `toQueryRefs`
detects which on its own — nothing to annotate on your side.
:::

## UseQueryStatesOptions <Badge type="info" text="@vuqs/core" />

Per-instance behavior for both composables. The query source and URL writer come
from the [adapter](/api/adapters#queryadapter), never from here.

### Properties

```ts
interface UseQueryStatesOptions extends NavigateOptions {
  history?: 'replace' | 'push' // from NavigateOptions
  scroll?: boolean             // from NavigateOptions
  throttleMs?: number          // coalescing window; default microtask
  clearOnDefault?: boolean     // default true
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `history` | `'replace' \| 'push'` | `'replace'` | Push a history entry or replace the current one. |
| `scroll` | `boolean` | adapter-defined | Forwarded to the adapter. |
| `throttleMs` | `number` | microtask | Coalesce writes within this window into one navigation. |
| `clearOnDefault` | `boolean` | `true` | Drop a value from the URL when it equals its codec default. |

See [Navigation options](/guide/navigation-options) for behavior and precedence.

## queryParam <Badge type="info" text="@vuqs/core" />

Builds a reusable [param](/guide/defining-params) from a path + codec, or a
composed object param.

### Signature

```ts
// String shorthand (codec defaults to codecs.string)
function queryParam(path: string): QueryParamBuilder<string>
function queryParam(path: string, options: { defaultValue: string }): QueryParamBuilderWithDefault<string>

// Single key
function queryParam<T>(path: string, codec: CodecWithDefault<T>): QueryParamBuilderWithDefault<T>
function queryParam<T>(path: string, codec: Codec<T>): QueryParamBuilder<T>

// Object composition
queryParam.object(children)
queryParam.object(prefix, children)
queryParam.object(prefix, param)
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `path` | `string` | The query key the param owns. |
| `options` | `{ defaultValue: string }` | String-shorthand default, equivalent to `codecs.string.withDefault(...)`. |
| `codec` | `Codec<T>` | The codec bound to `path`. |
| `children` | `Record<string, DefinedQueryParam<any>>` | Child params for object composition. |
| `prefix` | `string` | Path prefix applied to child params or to an existing param. |
| `param` | `DefinedQueryParam<T>` | An existing param or object to prefix and reuse. |

### Returns

A builder — `QueryParamBuilder<T>`, or `QueryParamBuilderWithDefault<T>` when the
codec, options, or a modifier carries a default. A builder is a
`DefinedQueryParam<T>` with chainable modifiers.

### Modifiers

Every builder is chainable. `withDefaultsWhenPresent` is available on object
builders only.

| Modifier | Description |
| --- | --- |
| `.withDefault(value)` | Sets the param's default. Layers over the codec default and, for objects, accepts a partial fill. |
| `.withEquality((a, b) => boolean)` | Sets how the param's value is compared, which drives `clearOnDefault`. |
| `.keepOnDefault()` | Param-level `clearOnDefault: false`: a default value stays in the URL. |
| `.withDefaultsWhenPresent()` | Object only: apply child defaults only when the object is present in the URL or carries its own default. |
| `.transform({ read, write, eq? })` | Maps the param to a different public shape. Derives its default and equality from the source unless overridden. |

See [composite params](/guide/nested-keys#composite-params) for object composition.

### Example

```ts
import { codecs, queryParam } from '@vuqs/core'

const q = queryParam('q', { defaultValue: '' })
const sort = queryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc'))

const bounds = queryParam.object('bounds', {
  north: queryParam('n', codecs.float).withDefault(1),
  east: queryParam('e', codecs.float),
}).withDefaultsWhenPresent()
```

## provideQueryAdapter <Badge type="info" text="@vuqs/core" />

Provides a [`QueryAdapter`](/api/adapters#queryadapter) to descendant components,
so their composables resolve `query` / `navigate` automatically.

### Signature

```ts
function provideQueryAdapter(adapter: QueryAdapter): void
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `adapter` | `QueryAdapter` | The adapter to provide. Call from a component `setup`. |

### Example

```ts
import { provideQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideQueryAdapter(createVueRouterAdapter())
```

## installQueryAdapter <Badge type="info" text="@vuqs/core" />

The app-level counterpart to `provideQueryAdapter`: provides the adapter on the
Vue `App` rather than the current component instance.

### Signature

```ts
function installQueryAdapter(app: App, adapter: QueryAdapter): void
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `app` | `App` | The Vue [application instance](https://vuejs.org/api/application.html). |
| `adapter` | `QueryAdapter` | The adapter to install app-wide. |

### Example

Runs where there is no active component instance — most notably a Nuxt plugin,
which is what the [Nuxt module](/nuxt/introduction) does under the hood:

```ts
installQueryAdapter(nuxtApp.vueApp, createVueRouterAdapter())
```

## useQueryAdapter <Badge type="info" text="@vuqs/core" />

Reads the adapter provided by an ancestor.

### Signature

```ts
function useQueryAdapter(): QueryAdapter | undefined
```

### Returns

The provided [`QueryAdapter`](/api/adapters#queryadapter), or `undefined` when
there's no injection context or no adapter — safe to call outside a component.
