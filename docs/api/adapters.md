# API: adapters

The adapter is the boundary where vuqs reads and writes the URL. See the
[Adapters guide](/guide/adapters) for the full picture.

## `QueryAdapter`

`import type { QueryAdapter } from 'vuqs'`

```ts
interface QueryAdapter {
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>
  defaultOptions?: QueryAdapterDefaultOptions
}
```

- `query` — the current parsed query, as a ref, getter, or plain value.
- `navigate` — stringify the next query and apply it (push or replace per
  `options.history`). May be sync or async.
- `defaultOptions` — app-wide defaults at the bottom of the
  [precedence chain](/guide/navigation-options#precedence).

## `QueryAdapterDefaultOptions`

```ts
interface QueryAdapterDefaultOptions extends NavigateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
  throttleMs?: number
  clearOnDefault?: boolean
}
```

## vue-router adapter

`import { createVueRouterAdapter, provideVueRouterAdapter } from 'vuqs/adapters/vue-router'`

`vue-router` is an **optional** peer dependency — installed only if you use this
subpath.

### `createVueRouterAdapter`

```ts
function createVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter

interface VueRouterAdapterOptions {
  router?: Router                          // defaults to useRouter()
  defaultOptions?: QueryAdapterDefaultOptions
}
```

Builds a `QueryAdapter` backed by `vue-router`. Reads
`router.currentRoute.value.query`; writes with `router.replace`, switching to
`router.push` when `history` is `'push'`. The router defaults to `useRouter()`, so
call it inside `setup` unless you pass `router` explicitly.

Returns the adapter **without** providing it — pass `adapter.query` /
`adapter.navigate` where needed (e.g. into a `useQueryStates` call).

::: tip Nested keys
Dotted keys (`filters.sort`) and array values require `vue-router` configured with
`qs` for `parseQuery`/`stringifyQuery`. See [Nested keys](/guide/nested-keys).
:::

::: tip `scroll`
`vue-router` controls scrolling through `scrollBehavior`, so the per-call `scroll`
option is ignored by this adapter.
:::

### `provideVueRouterAdapter`

```ts
function provideVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter
```

`provideQueryAdapter(createVueRouterAdapter(options))` in one call. Returns the
created adapter. Works for both Vue SPAs and Nuxt (Nuxt's router *is*
`vue-router`).

```ts
provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

## Manual adapters

Any object satisfying `QueryAdapter` works. See
[Manual adapter](/guide/adapters#manual-adapter) for framework-free and
custom-provider recipes.
