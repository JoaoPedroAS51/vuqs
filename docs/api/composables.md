# API: composables

Functions for binding query params to refs and configuring the
[adapter](/api/adapters) they read and write through.

## useQueryState <Badge type="info" text="@vuqs/core" />

Binds a single query key to a writable ref.

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

**Parameters**

- `path: string`
  - The query key to bind. Use a dot-path (`'filters.sort'`) for [nested keys](/guide/going-further/defining-params#nested-keys).
  - Pass either `path` (with an optional `codec`) **or** a pre-built `param`.
- `codec?: Codec<T>`
  - How the value parses and serializes. Defaults to `codecs.string`.
  - A codec built with `.withDefault(v)` narrows the ref to `T` and keeps the default out of the URL.
- `param?: DefinedQueryParam<T>`
  - A param from [`queryParam`](#queryparam), passed in place of `path` + `codec`.
- `options?: UseQueryStatesOptions`
  - Per-instance navigation and write behavior. See [`UseQueryStatesOptions`](#usequerystatesoptions).
  - String shorthand only: pass `{ defaultValue: string }` for a plain string key. `defaultValue` is string-only; for other types pass `codecs.X.withDefault(...)`.

**Returns**

- `state: UseQueryStateReturn<T>`
  - A writable computed ref (`QueryStateRef<T>`) with a `.use()` for modules.
    Reads are `T` when the codec or param carries a default, otherwise `T | undefined`.
  - `state.value: T`
    - Read or write the value; `v-model` binds here. Assigning `undefined` clears a param whose type includes it.
  - `state.set(value, options?): void`
    - Write with per-call [navigation options](/guide/essentials/navigation-options).
  - `state.clear(options?): void`
    - Remove the key from the URL, reverting to its default.
  - `state.use(module): UseQueryStateReturn<…>`
    - Compose a single-param [module](/modules/) onto the ref, merging its API and
      widening the type. Returns the same ref object.

**Example**

```ts
import { codecs, useQueryState } from '@vuqs/core'

const page = useQueryState('page', codecs.integer.withDefault(1))

page.value++ // ?page=2
page.set(1, { history: 'push' }) // push a history entry
page.clear() // back to the default
```

::: warning `.set` / `.clear` aren't reachable in templates
Vue auto-unwraps a top-level ref in templates, so call them from a function in
`<script setup>`. See [the guide](/guide/essentials/use-query-state#using-it-in-templates).
:::

## useQueryStates <Badge type="info" text="@vuqs/core" />

Binds a [schema](/guide/essentials/concepts#schema-a-map-of-params) of params to a
reactive value map plus batch writers.

```ts
function useQueryStates<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options?: UseQueryStatesOptions,
): QueryComposable<NormalizeQueryStateSchema<TSchema>, UseQueryStatesReturn<NormalizeQueryStateSchema<TSchema>>>
```

**Parameters**

- `schema: TSchema`
  - A map of logical name to a **codec** (the map key becomes the query key) or a
    param from [`queryParam`](#queryparam) (for a custom key, object param, or
    modifier).
- `options?: UseQueryStatesOptions`
  - Per-instance navigation and write behavior, shared by every param in the
    schema. See [`UseQueryStatesOptions`](#usequerystatesoptions).

**Returns**

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
[`useQueryState`](#usequerystate) gives a single param. Use
[`toQueryRefs`](#toqueryrefs) to create one ref per field.

**Throws** if two params declare the same query path, or if no adapter has been
provided (see [`provideQueryAdapter`](#providequeryadapter)).

**Example**

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

## toQueryRefs <Badge type="info" text="@vuqs/core" />

Projects the composable into one writable ref per field. Use it to recover the
per-field `.set`/`.clear` that the grouped `values` map drops, or to pass a single
field around.

```ts
function toQueryRefs<TSchema extends QueryStateSchema>(query: QueryBindingSource<TSchema>): ToQueryRefs<TSchema>
```

**Parameters**

- `query: QueryBindingSource<TSchema>`
  - The [`useQueryStates`](#usequerystates) composable. For read-only per-field refs
    over a module's `selected`/`defaults` map, use Vue's `toRefs` directly.

**Returns**

- `refs: ToQueryRefs<TSchema>`
  - One [`QueryStateRef`](#usequerystate) per param, with writable `.value` plus
    `.set`/`.clear`. A param with a default reads as `T`, otherwise
    `T | undefined`. Assigning `undefined` clears when the ref type includes it;
    `.clear()` is available for defaulted params too.

**Example**

```ts
import { codecs, toQueryRefs, useQueryStates } from '@vuqs/core'

const query = useQueryStates({ q: codecs.string, page: codecs.integer.withDefault(1) })
const { q, page } = toQueryRefs(query)

q.set('phone')
page.clear()
```

## toQueryRef <Badge type="info" text="@vuqs/core" />

Binds the whole schema to one writable ref, the singular counterpart to
[`toQueryRefs`](#toqueryrefs): a plain snapshot on read, an exhaustive replace on
write. Use it when the value is the complete state, such as a form model or an API
request object.

```ts
function toQueryRef<TSchema extends QueryStateSchema>(query: QueryBindingSource<TSchema>): QueryRef<TSchema>
```

**Parameters**

- `query: QueryBindingSource<TSchema>`
  - The [`useQueryStates`](#usequerystates) composable.

**Returns**

- `ref: QueryRef<TSchema>`
  - A writable ref over the whole object, plus `.set(value, options?)` and
    `.clear(options?)`.
  - Reading yields a plain snapshot of the resolved values after the read
    pipeline; `undefined` entries are omitted. The snapshot keeps a stable
    reference while its content is unchanged, so a whole-object `v-model` does not churn identity.
  - Writing **replaces** the state: params not present in the assigned value are
    cleared, as are params explicitly set to `undefined`.

**Example**

```ts
import { codecs, toQueryRef, useQueryStates } from '@vuqs/core'

const query = useQueryStates({ q: codecs.string, sort: codecs.string })
const filters = toQueryRef(query)

filters.value = { q: 'phone', sort: 'desc' } // set q + sort, clear the rest
filters.value = { ...filters.value, q: 'sale' } // keep the object, change q
filters.clear()
```

## UseQueryStatesOptions <Badge type="info" text="@vuqs/core" />

Per-instance behavior for both composables. The query source and URL writer come
from the [adapter](/api/adapters#queryadapter), never from here.

```ts
interface UseQueryStatesOptions extends NavigateOptions {
  throttleMs?: number
  clearOnDefault?: boolean
}
```

**Properties**

| Property | Type | Description |
| --- | --- | --- |
| `history` | `'replace' \| 'push'` | Optional. Defaults to `'replace'`. Push or replace a history entry. |
| `scroll` | `boolean` | Optional. Defaults to the adapter's behavior. Forwarded to the adapter. |
| `throttleMs` | `number` | Optional. Defaults to a microtask. Coalesce writes within this many milliseconds. |
| `clearOnDefault` | `boolean` | Optional. Defaults to `true`. Drop values equal to their resolved defaults. |

See [Navigation & options](/guide/essentials/navigation-options) for behavior and
precedence.

## queryParam <Badge type="info" text="@vuqs/core" />

Builds a reusable [param](/guide/going-further/defining-params). Returns a chainable
**builder** that is itself a param and can be passed to a schema, `useQueryState`,
or the serializer.

```ts
function queryParam(path: string): QueryParamBuilder<string>
function queryParam(path: string, options: { defaultValue: string }): QueryParamBuilderWithDefault<string>
function queryParam<T>(path: string, codec: CodecWithDefault<T>): QueryParamBuilderWithDefault<T>
function queryParam<T>(path: string, codec: Codec<T>): QueryParamBuilder<T>
```

**Parameters**

- `path: string`
  - The query key the param owns.
- `codec?: Codec<T>`
  - The codec bound to `path`. With none, the param is a plain string;
    `{ defaultValue }` is shorthand for a string with a default. A `CodecWithDefault`
    produces a defaulted param.
- `options: { defaultValue: string }`
  - The string default, passed in place of a codec.

**Returns**

- `builder: QueryParamBuilder<T>` (or `QueryParamBuilderWithDefault<T>` when defaulted)
  - A `DefinedQueryParam<T>` with chainable modifiers, each returning a new builder:
    - `.withDefault(v)`: sets the param's default.
    - `.withEquality(eq)`: sets how values compare (drives `clearOnDefault`).
    - `.keepOnDefault()`: keeps a default-valued write in the URL.
    - `.transform({ read, write, eq? })`: maps the param to a different public shape.

**`queryParam.object`** composes a multi-key param from child params:

```ts
queryParam.object(children) // merge child params into one object value
queryParam.object(prefix, children) // prefix every child key
queryParam.object(prefix, param) // reuse a param under a prefix
```

See [Defining params](/guide/going-further/defining-params) for paths, object params,
and reusable schemas.

**Example**

```ts
import { codecs, queryParam } from '@vuqs/core'

const sort = queryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc'))
```

## defineQuerySchema <Badge type="info" text="@vuqs/core" />

Names a reusable [schema](/guide/going-further/defining-params#reusing-a-schema),
normalized so its type stays stable across composables and `typeof` derivations.

```ts
function defineQuerySchema<const TSchema extends QueryStateSchemaInput>(schema: TSchema): NormalizeQueryStateSchema<TSchema>
```

**Parameters**

- `schema: TSchema`
  - A map of logical name to a codec or a [`queryParam`](#queryparam) definition,
    the same input `useQueryStates` accepts.

**Returns**

- `schema: NormalizeQueryStateSchema<TSchema>`
  - The schema with codec-shorthand entries normalized to `DefinedQueryParam`. Pass
    it to `useQueryStates` or [`createSerializer`](/api/serializer#createserializer),
    and derive value types with `QueryStateValues<typeof schema>`.

**Example**

```ts
import { codecs, defineQuerySchema, queryParam } from '@vuqs/core'

export const filters = defineQuerySchema({
  q: codecs.string,
  status: queryParam('status', codecs.literal(['open', 'closed'] as const)),
})
```

## provideQueryAdapter <Badge type="info" text="@vuqs/core" />

Provides a [`QueryAdapter`](/api/adapters#queryadapter) to descendant components, so
their composables resolve `query`/`navigate` automatically.

```ts
function provideQueryAdapter(adapter: QueryAdapter): void
```

**Parameters**

- `adapter: QueryAdapter`
  - The adapter to provide. Call from a component `setup`.

**Returns**

- `void`
  - Provides the adapter to descendant components.

**Example**

```ts
import { provideQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideQueryAdapter(createVueRouterAdapter())
```

## installQueryAdapter <Badge type="info" text="@vuqs/core" />

The app-level counterpart to `provideQueryAdapter`: provides the adapter on the Vue
`App` rather than the current component instance.

```ts
function installQueryAdapter(app: App, adapter: QueryAdapter): void
```

**Parameters**

- `app: App`
  - The Vue [application instance](https://vuejs.org/api/application.html).
- `adapter: QueryAdapter`
  - The adapter to install app-wide.

**Returns**

- `void`
  - Installs the adapter on the Vue app.

**Example**

Install the adapter during app setup. The [Nuxt module](/nuxt/getting-started)
registers it from a plugin.

```ts
import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

const app = createApp({})
const router = createRouter({ history: createWebHistory(), routes: [] })
app.use(router)
installQueryAdapter(app, createVueRouterAdapter({ router }))
```

## useQueryAdapter <Badge type="info" text="@vuqs/core" />

Reads the adapter provided by an ancestor.

```ts
function useQueryAdapter(): QueryAdapter | undefined
```

**Parameters**

None.

**Returns**

- `adapter: QueryAdapter | undefined`
  - The provided [`QueryAdapter`](/api/adapters#queryadapter), or `undefined` when
    there is no injection context or no adapter. Safe to call outside a component.

**Example**

```ts
import { useQueryAdapter } from '@vuqs/core'

const adapter = useQueryAdapter()
const defaults = adapter?.defaultOptions
```
