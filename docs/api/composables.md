# API: composables

The reactive composables (bind query params to refs) plus the functions that wire
up the [adapter](/api/adapters) they read and write through.

## useQueryState <Badge type="info" text="@vuqs/core" />

Binds a single query key to a writable ref.

```ts
const state = useQueryState(path, codec?, options?)
const state = useQueryState(param, options?)
```

**Parameters**

- `path: string`
  - The query key to bind. Use a dot-path (`'filters.sort'`) for [nested keys](/guide/going-further/defining-params#nested-keys).
  - Pass either `path` (with an optional `codec`) **or** a pre-built `param`.
- `codec?: Codec<T>`
  - How the value parses and serializes. Defaults to `codecs.string`.
  - A codec built with `.withDefault(v)` narrows the ref to a non-nullable `T` and keeps the default out of the URL.
- `param?: DefinedQueryParam<T>`
  - A param from [`queryParam`](#queryparam), passed in place of `path` + `codec`.
- `options?: UseQueryStatesOptions`
  - Per-instance navigation and write behavior. See [`UseQueryStatesOptions`](#usequerystatesoptions).
  - String shorthand only: pass `{ defaultValue: string }` for a plain string key. `defaultValue` is string-only; for other types pass `codecs.X.withDefault(...)`.

**Returns**

- `state: UseQueryStateReturn<T>`
  - A writable computed ref (`QueryStateRef<T>`) with a `.use()` for modules. `T` is
    non-nullable when the codec or param carries a default, otherwise `T | undefined`.
  - `state.value: T`
    - Read or write the value; `v-model` binds here. Assigning `undefined` clears a nullable param.
  - `state.set(value, options?): void`
    - Write with per-call [navigation options](/guide/essentials/navigation-options).
  - `state.clear(options?): void`
    - Remove the key from the URL, reverting to its default.
  - `state.use(module): UseQueryStateReturn<…>`
    - Compose a single-param [module](/modules/) onto the ref, merging its API and
      widening the type. Returns the same ref object.

::: details Type signature
```ts
// With a codec
function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T>
function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T | undefined>

// String shorthand (no codec)
function useQueryState(path: string, options: StringOptions & { defaultValue: string }): UseQueryStateReturn<string>
function useQueryState(path: string, options?: StringOptions): UseQueryStateReturn<string | undefined>

// With a pre-built param
function useQueryState<T>(param: DefinedQueryParamWithDefault<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T>
function useQueryState<T>(param: DefinedQueryParam<T>, options?: UseQueryStatesOptions): UseQueryStateReturn<T | undefined>
```
`StringOptions` is `UseQueryStatesOptions` with `parse`/`serialize` forbidden, so a
codec routes to the codec overloads.
:::

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
const { values, setValues, clear } = useQueryStates(schema, options?)
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

- `values: { [K in keyof TSchema]: … }`
  - A reactive, writable map. `values.k` *is* the value, not a ref. A param with a
    default reads as non-nullable, otherwise `T | undefined`.
  - Replace, don't mutate: assign a new array or object; in-place mutation does not
    navigate.
- `setValues(values, options?): void`
  - Batch write, coalesced into one navigation. Per param: a value sets, `null`
    clears, `undefined`/absent skips.
- `clear(options?): void`
  - Reset every param to its default in one navigation.
- `.use(module): QueryComposable<…>`
  - Layer a [module](/modules/) onto the composable, merging its API and widening
    the return type. See the [`.use()` model](/modules/#the-use-model).

The grouped `values` map drops the per-field `.set`/`.clear` that
[`useQueryState`](#usequerystate) gives a single param. Explode it with
[`toQueryRefs`](#toqueryrefs) to get them back per field.

**Throws** if two params declare the same query path, or if no adapter has been
provided (see [`provideQueryAdapter`](#providequeryadapter)).

**Example**

```ts
import { codecs, useQueryStates } from '@vuqs/core'

const { values, setValues, clear } = useQueryStates({
  q: codecs.string.withDefault(''),
  page: codecs.integer.withDefault(1),
})

values.q = 'laptop' // ?q=laptop
setValues({ q: 'phone', page: 1 }) // one navigation
clear() // reset all
```

## toQueryRefs <Badge type="info" text="@vuqs/core" />

Explodes a value map into one ref per field, the way Pinia's `storeToRefs` explodes
a store. Use it to recover the per-field `.set`/`.clear` that the grouped `values`
map drops, or to pass a single field around.

```ts
function toQueryRefs<T extends object>(map: T): ToQueryRefs<T>
```

**Parameters**

- `map: T`
  - A value map from [`useQueryStates`](#usequerystates) (`values`) or a module
    (`selected`/`defaults`).

**Returns**

- `refs: ToQueryRefs<T>`
  - One ref per field, keyed by param. The helper detects the source shape on its
    own.
  - From the writable `values` map: a [`QueryStateRef`](#usequerystate) per field,
    with writable `.value` plus `.set`/`.clear`. Assigning `undefined` clears.
  - From a read-only map (`selected`/`defaults`): a `ComputedRef` per field.

## UseQueryStatesOptions <Badge type="info" text="@vuqs/core" />

Per-instance behavior for both composables. The query source and URL writer come
from the [adapter](/api/adapters#queryadapter), never from here.

**Properties**

- `history?: 'replace' | 'push'`
  - Default `'replace'`. Push a new history entry, or replace the current one.
- `scroll?: boolean`
  - Default adapter-defined. Forwarded to the adapter.
- `throttleMs?: number`
  - Default a microtask. Coalesce writes within this window into one navigation.
- `clearOnDefault?: boolean`
  - Default `true`. Drop a value from the URL when it equals its resolved default.

See [Navigation & options](/guide/essentials/navigation-options) for behavior and
precedence.

## queryParam <Badge type="info" text="@vuqs/core" />

Builds a reusable [param](/guide/going-further/defining-params). Returns a chainable
**builder** that is itself a param, so it drops into a schema, `useQueryState`, or
the serializer.

```ts
const param = queryParam(path, codec?)
const param = queryParam.object(children)
```

**Parameters**

- `path: string`
  - The query key the param owns.
- `codec?: Codec<T>`
  - The codec bound to `path`. With none, the param is a plain string;
    `{ defaultValue }` is shorthand for a string with a default. A `CodecWithDefault`
    produces a defaulted param.

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

See [Defining params](/guide/going-further/defining-params) for the full walkthrough.

**Example**

```ts
import { codecs, queryParam } from '@vuqs/core'

const sort = queryParam('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc'))
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

**Example**

Runs where there is no active component instance, most notably a Nuxt plugin, which
is what the [Nuxt module](/nuxt/getting-started) does under the hood:

```ts
installQueryAdapter(nuxtApp.vueApp, createVueRouterAdapter())
```

## useQueryAdapter <Badge type="info" text="@vuqs/core" />

Reads the adapter provided by an ancestor.

```ts
function useQueryAdapter(): QueryAdapter | undefined
```

**Returns**

- `adapter: QueryAdapter | undefined`
  - The provided [`QueryAdapter`](/api/adapters#queryadapter), or `undefined` when
    there is no injection context or no adapter. Safe to call outside a component.
