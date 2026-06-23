# API: @vuqs/store

`import { createQueryStore, createQueryStoreKey, provideQueryStore, useQueryStore } from '@vuqs/store'`

See the [Store guide](/store/introduction) for the narrative. `@vuqs/store` depends
on `vuqs` and shares its codecs, fields, and adapters.

## `createQueryStore`

```ts
function createQueryStore<TSchema, TContext extends string = string>(
  options: CreateQueryStoreOptions<TSchema, TContext>,
): QueryStore<TSchema, TContext>
```

### `CreateQueryStoreOptions`

```ts
interface CreateQueryStoreOptions<TSchema, TContext> {
  schema: TSchema                          // use PLAIN codecs (no .withDefault)
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: QueryStateNavigate
  history?: 'replace' | 'push'
  scroll?: boolean
  throttleMs?: number
  clearOnDefault?: boolean
  context?: QueryStoreContext<TSchema, TContext>
}
```

::: warning Plain codecs in store schemas
Defaults come from `setDefaults` (the API), not the codec. A codec
`.withDefault()` would shadow the API defaults in `effective`. Use bare codecs.
:::

Must run inside a Vue effect scope (it creates a `watch`).

**Throws** if two fields declare the same query path.

### `QueryStoreContext`

```ts
interface QueryStoreContext<TSchema, TContext> {
  active: MaybeRefOrGetter<TContext>                                  // external, opaque
  preserve?: ReadonlyArray<keyof TSchema & string>                   // kept on a switch
  only?: Partial<Record<keyof TSchema & string, readonly TContext[]>> // validity per context
}
```

See [Context switching](/store/context).

## `QueryStore`

The object returned by `createQueryStore`.

```ts
interface QueryStore<TSchema, TContext = string> {
  // States (readonly reactive objects — dot access, no .value)
  selected: Readonly<QueryStateValues<TSchema>>
  defaults: Readonly<QueryStateValues<TSchema>>
  effective: Readonly<QueryStateValues<TSchema>>

  // The active context (a ref — use .value)
  activeContext: ComputedRef<TContext | undefined>

  // Write selections
  setValue: <K extends keyof TSchema & string>(key: K, value: QueryStateValues<TSchema>[K], options?: NavigateOptions) => void
  setValues: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void

  // Manage defaults
  setDefaults: (values: QueryStateValues<TSchema>) => void
  clearDefaults: () => void

  // Build queries without navigating
  buildQuery: (currentQuery: ParsedQuery) => ParsedQueryRaw
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
}
```

### States

- `selected` — explicit selections, mirrored from the URL, filtered by the active
  context. The only state serialized.
- `defaults` — API-supplied, never serialized.
- `effective` — `{ ...defaults, ...selected }`, filtered by context. The read
  model.

All three are **readonly reactive** — `store.selected.q`, not `.value`.
`activeContext` is a **ref** (`.value`) because it's a single scalar.

### Writers

- `setValue(key, value, options?)` — set one field. `undefined` clears it
  (reverting to its default). Ignored for a field invalid in the active context.
- `setValues(values, options?)` — batch; `null` clears, `undefined`/absent skips,
  a value sets. One navigation.
- `clear(options?)` — clear every (valid) field.
- `setDefaults(values)` — **replace** the defaults with a snapshot. Auto-cleared
  on a context change.
- `clearDefaults()` — remove all defaults.

### Query builders

- `buildQuery(currentQuery)` — the query for the current selection, without
  navigating. Only `selected` is serialized.
- `buildContextQuery(currentQuery, nextContext)` — the query for switching to
  `nextContext`: keeps preserved + valid fields, resets the rest, preserves
  unmanaged params. You perform the navigation. See
  [Context switching](/store/context#performing-a-switch).

## provide / inject

### `createQueryStoreKey`

```ts
function createQueryStoreKey<TSchema, TContext = string>(description?: string): QueryStoreKey<TSchema, TContext>
```

A typed injection key (`InjectionKey<QueryStore<…>>`). `description` shows in
devtools.

### `provideQueryStore`

```ts
function provideQueryStore<TSchema, TContext = string>(
  key: QueryStoreKey<TSchema, TContext>,
  options: CreateQueryStoreOptions<TSchema, TContext>,
): QueryStore<TSchema, TContext>
```

Creates a store and provides it to descendants. Returns the store so the provider
can use it too.

### `useQueryStore`

```ts
function useQueryStore<TSchema, TContext = string>(key: QueryStoreKey<TSchema, TContext>): QueryStore<TSchema, TContext>
```

Reads a store provided by an ancestor. **Throws** if no matching store is in
scope. See [Provide / inject](/store/provide-inject).
