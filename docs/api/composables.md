# API: composables

`import { useQueryState, useQueryStates, defineQueryParam, provideQueryAdapter, useQueryAdapter } from 'vuqs'`

## `useQueryState`

Binds a single query key to a writable ref. See the
[guide](/guide/use-query-state) for examples and the template gotcha.

### Overloads

```ts
// With a codec (canonical)
function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>

// String shorthand
function useQueryState(path: string, options: StringOptions & { defaultValue: string }): QueryStateRef<string>
function useQueryState(path: string, options?: StringOptions): QueryStateRef<string | undefined>

// With a pre-built definition
function useQueryState<T>(definition: QueryParamDefinitionWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
function useQueryState<T>(definition: QueryParamDefinition<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>
```

`StringOptions` is `UseQueryStatesOptions` with `parse`/`serialize` forbidden, so
a codec routes to the codec overloads. `defaultValue` is **string-only** — for
other types pass `codecs.X.withDefault(...)`.

### Returns: `QueryStateRef<T>`

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

- `.value` — read/write (clears via `undefined` on a nullable param).
- `.set(value, options?)` — write with per-call [options](/guide/navigation-options).
- `.clear(options?)` — remove the key (revert to default).

::: warning `.set`/`.clear`/`.value` are dropped in templates
Vue auto-unwraps a top-level ref in templates, so the methods aren't reachable
there. Call them from a function in `<script setup>` instead. See
[the guide](/guide/use-query-state#using-it-in-templates).
:::

## `useQueryStates`

Binds a schema of params to a reactive value map plus batch writers.

```ts
function useQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options?: UseQueryStatesOptions,
): UseQueryStatesReturn<TSchema>
```

### Returns: `UseQueryStatesReturn`

```ts
interface UseQueryStatesReturn<TSchema> {
  values: { [K in keyof TSchema]: /* T, or T | undefined without a default */ }
  setValues: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

- `values` — reactive, writable; `values.k` is the value. Params with a default
  are non-nullable. **Replace, don't mutate** arrays/objects.
- `setValues(values, options?)` — batch write; `null` clears, `undefined`/absent
  skips, a value sets. Coalesced into one navigation.
- `clear(options?)` — reset every param.

**Throws** if two params declare the same query path, or if no adapter has been
provided (see [`provideQueryAdapter`](#providequeryadapter)).

## `UseQueryStatesOptions`

Behavior knobs only — the query source and URL writer come from the
[adapter](/api/adapters#queryadapter), never from here. Shared by both composables.

```ts
interface UseQueryStatesOptions extends NavigateOptions {
  history?: 'replace' | 'push'  // from NavigateOptions
  scroll?: boolean              // from NavigateOptions
  throttleMs?: number           // coalescing window; default microtask
  clearOnDefault?: boolean      // default true
}
```

See [Navigation options](/guide/navigation-options) for behavior and precedence.

## `defineQueryParam`

Builds a reusable [param](/guide/defining-params) from a path + codec, or a
custom multi-key definition.

```ts
// Single key
function defineQueryParam<T>(path: string, codec: CodecWithDefault<T>): QueryParamDefinitionWithDefault<T>
function defineQueryParam<T>(path: string, codec: Codec<T>): QueryParamDefinition<T>

// Composite / custom
function defineQueryParam<T>(definition: QueryParamDefinitionInput<T>): QueryParamDefinition<T>

interface QueryParamDefinitionInput<T> {
  paths: readonly string[]              // every key serialize writes
  parse: (query: ParsedQuery) => T | undefined
  serialize: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean          // defaults to structuralEq
  default?: T
}
```

A dev guard throws on the first `serialize` if it writes a key outside `paths`.
See [composite params](/guide/nested-keys#composite-params).

## `provideQueryAdapter`

```ts
function provideQueryAdapter(adapter: QueryAdapter): void
```

Provides a [`QueryAdapter`](/api/adapters#queryadapter) to descendants, so their
composables resolve `query`/`navigate` automatically. Call from `setup`.

## `installQueryAdapter`

```ts
function installQueryAdapter(app: App, adapter: QueryAdapter): void
```

The app-level counterpart to `provideQueryAdapter`: it provides the adapter on
the Vue [`App`](https://vuejs.org/api/application.html) rather than the current
component instance, so it can run where there is no active instance — most
notably a Nuxt plugin (`installQueryAdapter(nuxtApp.vueApp, adapter)`). Every
descendant then resolves it through `useQueryAdapter`. This is what the
[Nuxt module](/nuxt/introduction) uses under the hood.

## `useQueryAdapter`

```ts
function useQueryAdapter(): QueryAdapter | undefined
```

Reads the adapter provided by an ancestor. Returns `undefined` when there's no
injection context or no adapter — safe to call outside a component.
