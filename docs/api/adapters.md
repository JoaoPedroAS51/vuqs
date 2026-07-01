# API: adapters

The adapter is the boundary where vuqs reads and writes the URL. See the
[Adapters guide](/guide/getting-started/adapters) for the full picture.

## QueryAdapter <Badge type="info" text="@vuqs/core" />

The contract every adapter satisfies.

```ts
interface QueryAdapter {
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>
  defaultOptions?: QueryAdapterDefaultOptions
}
```

**Properties**

- `query: MaybeRefOrGetter<ParsedQuery>`
  - The current parsed query, as a ref, getter, or plain value.
- `navigate: (query, options) => void | Promise<void>`
  - Stringify the next query and apply it, pushing or replacing per
    `options.history`. May be sync or async.
- `defaultOptions?: QueryAdapterDefaultOptions`
  - App-wide defaults at the bottom of the
    [precedence chain](/guide/essentials/navigation-options#precedence).

## QueryAdapterDefaultOptions <Badge type="info" text="@vuqs/core" />

Defaults an adapter applies to every write. Extends `NavigateOptions`.

**Properties**

- `history?: 'replace' | 'push'`
  - Push a new history entry, or replace the current one.
- `scroll?: boolean`
  - Whether the navigation scrolls, forwarded to the adapter.
- `throttleMs?: number`
  - Coalesce writes within this window into one navigation.
- `clearOnDefault?: boolean`
  - Drop a value from the URL when it equals its resolved default.

See [Navigation & options](/guide/essentials/navigation-options#precedence) for how
these compose with per-instance and per-call options.

## createVueRouterAdapter <Badge type="tip" text="@vuqs/core/adapters/vue-router" />

Builds a [`QueryAdapter`](#queryadapter) backed by `vue-router`. `vue-router` is an
**optional** peer dependency, pulled in only if you import this subpath.

```ts
function createVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter
```

**Parameters**

- `options?: VueRouterAdapterOptions`
  - `router?: Router`: the router instance. Defaults to `useRouter()`, so call inside
    `setup` unless you pass it (required in a plugin or `main.ts`).
  - `defaultOptions?: QueryAdapterDefaultOptions`: adapter-level navigation defaults.

**Returns**

- `adapter: QueryAdapter`
  - Returned **without** being provided. Pass it to
    [`installQueryAdapter`](/api/composables#installqueryadapter) or
    [`provideQueryAdapter`](/api/composables#providequeryadapter). It reads
    `router.currentRoute.value.query` and writes with `router.replace`, switching to
    `router.push` when `history` is `'push'`.

```ts
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

const adapter = createVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

::: tip Nested keys
Dotted keys (`filters.sort`) and array values require `vue-router` configured with
`qs` for `parseQuery`/`stringifyQuery`. See [Nested keys](/guide/going-further/defining-params#nested-keys).
:::

::: tip `scroll`
`vue-router` controls scrolling through `scrollBehavior`, so the per-call `scroll`
option is ignored by this adapter.
:::

## provideVueRouterAdapter <Badge type="tip" text="@vuqs/core/adapters/vue-router" />

`provideQueryAdapter(createVueRouterAdapter(options))` in one call.

```ts
function provideVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter
```

**Parameters**

- `options?: VueRouterAdapterOptions`
  - Same as [`createVueRouterAdapter`](#createvuerouteradapter).

**Returns**

- `adapter: QueryAdapter`
  - The created adapter, already provided to descendant components. Works for both
    Vue SPAs and Nuxt (Nuxt's router *is* `vue-router`).

```ts
import { provideVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

## Manual adapters

Any object satisfying [`QueryAdapter`](#queryadapter) works. See
[Bring your own adapter](/guide/getting-started/adapters#bring-your-own-adapter) for
framework-free and custom-provider recipes.
