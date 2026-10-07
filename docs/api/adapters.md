# API: adapters

The adapter is the boundary where vuqs reads and writes the URL. See the
[Adapters guide](/guide/getting-started/adapters) for setup and implementation
details.

## QueryAdapter <Badge type="info" text="@vuqs/core" />

The contract every adapter satisfies.

```ts
interface QueryAdapter {
  debugName?: string
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: QueryStateNavigate
  defaultOptions?: QueryAdapterDefaultOptions
}
```

**Properties**

| Property | Type | Description |
| --- | --- | --- |
| `debugName` | `string` | Optional adapter identity used by opt-in diagnostics. |
| `query` | `MaybeRefOrGetter<ParsedQuery>` | The current parsed query, as a ref, getter, or plain value. |
| `navigate` | `QueryStateNavigate` | Applies the next query. On completion, `query` exposes the final state, including normalization and redirects. Returns `void` or `Promise<void>`; throws or rejects on failure or cancellation. |
| `defaultOptions` | `QueryAdapterDefaultOptions` | Optional adapter defaults at the bottom of the [precedence chain](/guide/essentials/navigation-options#precedence). |

Adapter object identity defines a runtime boundary. Bindings using the same adapter
share one optimistic overlay, write queue, and transaction-start registry. Bindings
using different adapter objects are isolated, even when their query paths overlap.

The queue removes only the versions belonging to a completed attempt. A later
write to the same path remains pending, even when it has the same value. A rejected
promise or a synchronous error rolls back the attempt's current versions.

## QueryAdapterDefaultOptions <Badge type="info" text="@vuqs/core" />

Defaults an adapter applies to every write. Extends `NavigateOptions`.

```ts
interface QueryAdapterDefaultOptions extends NavigateOptions {
  throttleMs?: number
  clearOnDefault?: boolean
}
```

**Properties**

| Property | Type | Description |
| --- | --- | --- |
| `history` | `'replace' \| 'push'` | Optional. Push a history entry or replace the current one. |
| `scroll` | `boolean` | Optional. Whether navigation scrolls, forwarded to the adapter. |
| `throttleMs` | `number` | Optional. Coalesce writes within this many milliseconds. |
| `clearOnDefault` | `boolean` | Optional. Drop a value from the URL when it equals its resolved default. |

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
  - `navigate` resolves for successful and duplicate navigations. Router errors,
    aborted navigations, and cancelled navigations reject its promise.

**Example**

```ts
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

const adapter = createVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

::: tip Nested keys
Nested objects require matching `parseQuery`/`stringifyQuery`, for example with
`qs`. Top-level repeated-key arrays work with the default `vue-router` parser. See [Nested keys](/guide/going-further/defining-params#nested-keys).
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
  - The created adapter, already provided to descendant components.

**Example**

```ts
import { provideVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

## createBrowserHistoryAdapter <Badge type="tip" text="@vuqs/core/adapters/browser-history" />

Builds a `QueryAdapter` backed by `window.location.search` and the browser History API.

```ts
interface BrowserHistoryAdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}

interface BrowserHistoryAdapter extends QueryAdapter {
  refresh: () => void
  dispose: () => void
}

function createBrowserHistoryAdapter(options?: BrowserHistoryAdapterOptions): BrowserHistoryAdapter
```

**Parameters**

- `options?: BrowserHistoryAdapterOptions`
  - `defaultOptions?: QueryAdapterDefaultOptions`: adapter-level navigation and write defaults.

**Returns**

- `adapter: BrowserHistoryAdapter`
  - Ready to pass to `installQueryAdapter` or `provideQueryAdapter`.
  - `query`: a reactive getter for the parsed URL query.
  - `navigate`: synchronously writes with `replaceState`, or `pushState` for
    `history: 'push'`. Preserves the pathname, hash, and `history.state`.
    `scroll: true` scrolls to the top; otherwise the adapter leaves scroll in place.
  - `refresh()`: reads the current URL after external History API writes.
  - `dispose()`: removes the `popstate` listener and cancels pending writes.
    Repeated disposal is safe. Navigation and refresh throw after disposal.

Objects use dotted keys, and scalar arrays use repeated keys. Nullish values and
empty containers are omitted; empty strings remain. Arrays containing objects or
other arrays throw before navigation. A single repeated-key value reads as a scalar.
All scalar values read back as strings.

The query updates synchronously after adapter navigation and on `popstate`.
External `pushState` and `replaceState` calls require `refresh()`.
Creation requires a browser; importing the entry on the server is safe.

**Example**

```ts
import { createBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'

const adapter = createBrowserHistoryAdapter()
adapter.navigate({ filters: { sort: 'name' }, tag: ['a', 'b'] }, { history: 'push' })
// ?filters.sort=name&tag=a&tag=b

window.history.replaceState(window.history.state, '', '?q=external')
adapter.refresh()
adapter.dispose()
```

## provideBrowserHistoryAdapter <Badge type="tip" text="@vuqs/core/adapters/browser-history" />

Creates a browser History API adapter and provides it to descendant components.

```ts
function provideBrowserHistoryAdapter(options?: BrowserHistoryAdapterOptions): BrowserHistoryAdapter
```

**Parameters**

- `options?: BrowserHistoryAdapterOptions`
  - The same options as [`createBrowserHistoryAdapter`](#createbrowserhistoryadapter).

**Returns**

- `adapter: BrowserHistoryAdapter`
  - The created adapter, already provided. Call from a component `setup` in the browser.
  - Disposed automatically when the component's effect scope stops.

**Example**

```ts
import { provideBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'

provideBrowserHistoryAdapter({ defaultOptions: { history: 'replace' } })
```

## Manual adapters

Any object satisfying [`QueryAdapter`](#queryadapter) works. See
[Bring your own adapter](/guide/getting-started/adapters#bring-your-own-adapter) for
framework-free and custom-provider recipes.
