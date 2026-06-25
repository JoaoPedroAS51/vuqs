# API: adapters

The adapter is the boundary where vuqs reads and writes the URL. See the
[Adapters guide](/guide/adapters) for the full picture.

## QueryAdapter <Badge type="info" text="vuqs" />

The contract every adapter satisfies.

### Properties

```ts
interface QueryAdapter {
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>
  defaultOptions?: QueryAdapterDefaultOptions
}
```

| Property | Type | Description |
| --- | --- | --- |
| `query` | `MaybeRefOrGetter<ParsedQuery>` | The current parsed query, as a ref, getter, or plain value. |
| `navigate` | `(query, options) => void \| Promise<void>` | Stringify the next query and apply it (push or replace per `options.history`). May be sync or async. |
| `defaultOptions` | `QueryAdapterDefaultOptions` | App-wide defaults at the bottom of the [precedence chain](/guide/navigation-options#precedence). |

## QueryAdapterDefaultOptions <Badge type="info" text="vuqs" />

Defaults an adapter applies to every write.

### Properties

```ts
interface QueryAdapterDefaultOptions extends NavigateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
  throttleMs?: number
  clearOnDefault?: boolean
}
```

See [Navigation options](/guide/navigation-options#precedence) for how these
compose with per-instance and per-call options.

## createVueRouterAdapter <Badge type="tip" text="vuqs/adapters/vue-router" />

Builds a [`QueryAdapter`](#queryadapter) backed by `vue-router`. `vue-router` is
an **optional** peer dependency — pulled in only if you import this subpath.

### Signature

```ts
function createVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter

interface VueRouterAdapterOptions {
  router?: Router                          // defaults to useRouter()
  defaultOptions?: QueryAdapterDefaultOptions
}
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `options.router` | `Router` | The router instance. Defaults to `useRouter()`, so call inside `setup` unless passed. |
| `options.defaultOptions` | `QueryAdapterDefaultOptions` | Adapter-level navigation defaults. |

### Returns

A `QueryAdapter` — returned **without** providing it. Pass it to
[`installQueryAdapter`](/api/composables#installqueryadapter) or
[`provideQueryAdapter`](/api/composables#providequeryadapter). It reads
`router.currentRoute.value.query` and writes with `router.replace`, switching to
`router.push` when `history` is `'push'`.

### Example

```ts
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'

const adapter = createVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

::: tip Nested keys
Dotted keys (`filters.sort`) and array values require `vue-router` configured with
`qs` for `parseQuery`/`stringifyQuery`. See [Nested keys](/guide/nested-keys).
:::

::: tip `scroll`
`vue-router` controls scrolling through `scrollBehavior`, so the per-call `scroll`
option is ignored by this adapter.
:::

## provideVueRouterAdapter <Badge type="tip" text="vuqs/adapters/vue-router" />

`provideQueryAdapter(createVueRouterAdapter(options))` in one call.

### Signature

```ts
function provideVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter
```

### Parameters

Same as [`createVueRouterAdapter`](#createvuerouteradapter).

### Returns

The created `QueryAdapter`, already provided to descendants. Works for both Vue
SPAs and Nuxt (Nuxt's router *is* `vue-router`).

### Example

```ts
import { provideVueRouterAdapter } from 'vuqs/adapters/vue-router'

provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

## Manual adapters

Any object satisfying [`QueryAdapter`](#queryadapter) works. See
[Manual adapter](/guide/adapters#manual-adapter) for framework-free and
custom-provider recipes.
