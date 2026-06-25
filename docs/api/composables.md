# API: composables

The reactive composables — bind query params to refs — plus the functions that
wire up the [adapter](/api/adapters) they read and write through.

## useQueryState <Badge type="info" text="vuqs" />

Binds a single query key to a writable ref.

### Signature

```ts
function useQueryState<T>(
  path: string,
  codec?: Codec<T>,
  options?: UseQueryStatesOptions,
): QueryStateRef<T>
```

### Overloads

```ts
// With a codec (canonical)
function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>

// String shorthand (no codec)
function useQueryState(path: string, options: StringOptions & { defaultValue: string }): QueryStateRef<string>
function useQueryState(path: string, options?: StringOptions): QueryStateRef<string | undefined>

// With a pre-built param definition
function useQueryState<T>(definition: QueryParamDefinitionWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
function useQueryState<T>(definition: QueryParamDefinition<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `path` | `string` | The query key. Use a dot-path (`'filters.sort'`) for [nested keys](/guide/nested-keys). |
| `codec` | `Codec<T>` | How the value is parsed and serialized. Defaults to `codecs.string`. A `.withDefault()` codec narrows the ref to non-nullable. |
| `definition` | `QueryParamDefinition<T>` | A pre-built param from [`defineQueryParam`](#definequeryparam), passed in place of `path` + `codec`. |
| `options` | `UseQueryStatesOptions` | Per-instance behavior. Optional when an [adapter](/api/adapters) is provided. |

`StringOptions` is `UseQueryStatesOptions` with `parse`/`serialize` forbidden, so
a codec routes to the codec overloads. `defaultValue` is **string-only** — for
other types pass `codecs.X.withDefault(...)`.

### Returns

`QueryStateRef<T>` — a writable ref augmented with two methods:

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

- `.value` — read/write; assigning `undefined` clears a nullable param.
- `.set(value, options?)` — write with per-call [navigation options](/guide/navigation-options).
- `.clear(options?)` — remove the key (revert to its default).

### Example

```ts
import { codecs, useQueryState } from 'vuqs'

const page = useQueryState('page', codecs.integer.withDefault(1))

page.value++                    // ?page=2
page.set(1, { history: 'push' }) // push a history entry
page.clear()                    // back to the default
```

::: warning `.set` / `.clear` aren't reachable in templates
Vue auto-unwraps a top-level ref in templates, so call them from a function in
`<script setup>`. See [the guide](/guide/use-query-state#using-it-in-templates).
:::

## useQueryStates <Badge type="info" text="vuqs" />

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
| `schema` | `TSchema` | A map of logical name → [param definition](#definequeryparam). |
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
import { codecs, defineQueryParam, useQueryStates } from 'vuqs'

const { values, setValues, clear } = useQueryStates({
  q: defineQueryParam('q', codecs.string.withDefault('')),
  page: defineQueryParam('page', codecs.integer.withDefault(1)),
})

values.q = 'laptop'              // ?q=laptop
setValues({ q: 'phone', page: 1 }) // one navigation
clear()                          // reset all
```

::: tip `.use(module)`
`useQueryStates` returns a [`QueryComposable`](/modules/introduction#the-use-model) —
call `.use()` to layer modules like [`withRuntimeDefaults`](/modules/runtime-defaults) and
[`withContext`](/modules/context) onto it.
:::

## toQueryRefs <Badge type="info" text="vuqs" />

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
import { codecs, defineQueryParam, toQueryRefs, useQueryStates } from 'vuqs'

const { values } = useQueryStates({
  q: defineQueryParam('q', codecs.string),
  sort: defineQueryParam('sort', codecs.literal(['asc', 'desc'] as const)),
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

## UseQueryStatesOptions <Badge type="info" text="vuqs" />

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

## defineQueryParam <Badge type="info" text="vuqs" />

Builds a reusable [param](/guide/defining-params) from a path + codec, or a
custom multi-key definition.

### Signature

```ts
// Single key
function defineQueryParam<T>(path: string, codec: CodecWithDefault<T>): QueryParamDefinitionWithDefault<T>
function defineQueryParam<T>(path: string, codec: Codec<T>): QueryParamDefinition<T>

// Composite / custom
function defineQueryParam<T>(definition: QueryParamDefinitionInput<T>): QueryParamDefinition<T>
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `path` | `string` | The query key the param owns. |
| `codec` | `Codec<T>` | The codec bound to `path`. |
| `definition` | `QueryParamDefinitionInput<T>` | A custom param spanning one or more keys (see below). |

```ts
interface QueryParamDefinitionInput<T> {
  paths: readonly string[]              // every key serialize writes
  parse: (query: ParsedQuery) => T | undefined
  serialize: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean          // defaults to structuralEq
  default?: T
}
```

### Returns

A `QueryParamDefinition<T>` (or `QueryParamDefinitionWithDefault<T>` when the
codec carries a default). A dev guard throws on the first `serialize` if it writes
a key outside `paths`. See [composite params](/guide/nested-keys#composite-params).

### Example

```ts
import { codecs, defineQueryParam } from 'vuqs'

const sort = defineQueryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc'))
```

## provideQueryAdapter <Badge type="info" text="vuqs" />

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
import { provideQueryAdapter } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'

provideQueryAdapter(createVueRouterAdapter())
```

## installQueryAdapter <Badge type="info" text="vuqs" />

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

## useQueryAdapter <Badge type="info" text="vuqs" />

Reads the adapter provided by an ancestor.

### Signature

```ts
function useQueryAdapter(): QueryAdapter | undefined
```

### Returns

The provided [`QueryAdapter`](/api/adapters#queryadapter), or `undefined` when
there's no injection context or no adapter — safe to call outside a component.
