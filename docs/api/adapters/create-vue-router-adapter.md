# createVueRouterAdapter <Badge type="tip" text="@vuqs/core/adapters/vue-router" />

Builds a [`QueryAdapter`](/api/adapters/query-adapter) backed by `vue-router`. `vue-router` is an
**optional** peer dependency, pulled in only if you import this subpath.

## Usage

```ts
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

const adapter = createVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

## Type

```ts
function createVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter
```

## Parameters

- `options?: VueRouterAdapterOptions`
  - `router?: Router`: the router instance. Defaults to `useRouter()`, so call inside
    `setup` unless you pass it (required in a plugin or `main.ts`).
  - `defaultOptions?: QueryAdapterDefaultOptions`: adapter-level navigation defaults.

## Return value

- `adapter: QueryAdapter`
  - Returned **without** being provided. Pass it to
    [`installQueryAdapter`](/api/adapters/install-query-adapter) or
    [`provideQueryAdapter`](/api/adapters/provide-query-adapter). It reads
    `router.currentRoute.value.query` and writes with `router.replace`, switching to
    `router.push` when `history` is `'push'`.
  - `navigate` resolves for successful and duplicate navigations. Router errors,
    aborted navigations, and cancelled navigations reject its promise.

## Behavior

::: tip Nested keys
Nested objects require matching `parseQuery`/`stringifyQuery`, for example with
`qs`. Top-level repeated-key arrays work with the default `vue-router` parser. See [Nested keys](/guide/query-state/defining-params#nested-keys).
:::

::: tip `scroll`
`vue-router` controls scrolling through `scrollBehavior`, so the per-call `scroll`
option is ignored by this adapter.
:::

## VueRouterAdapterOptions

```ts
interface VueRouterAdapterOptions {
  router?: Router
  defaultOptions?: QueryAdapterDefaultOptions
}
```

## Related guide

[Adapters](/guide/getting-started/adapters).
