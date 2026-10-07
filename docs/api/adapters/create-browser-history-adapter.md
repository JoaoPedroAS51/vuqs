# createBrowserHistoryAdapter <Badge type="tip" text="@vuqs/core/adapters/browser-history" />

Builds a `QueryAdapter` backed by `window.location.search` and the browser History API.

## Usage

```ts
import { createBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'

const adapter = createBrowserHistoryAdapter()
adapter.navigate({ filters: { sort: 'name' }, tag: ['a', 'b'] }, { history: 'push' })
// ?filters.sort=name&tag=a&tag=b

window.history.replaceState(window.history.state, '', '?q=external')
adapter.refresh()
adapter.dispose()
```

## Type

```ts
function createBrowserHistoryAdapter(options?: BrowserHistoryAdapterOptions): BrowserHistoryAdapter
```

## Parameters

- `options?: BrowserHistoryAdapterOptions`
  - `defaultOptions?: QueryAdapterDefaultOptions`: adapter-level navigation and write defaults.

## Return value

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

## BrowserHistoryAdapterOptions

```ts
interface BrowserHistoryAdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}
```

## BrowserHistoryAdapter

```ts
interface BrowserHistoryAdapter extends QueryAdapter {
  refresh: () => void
  dispose: () => void
}
```

## Related guide

[Adapters](/guide/getting-started/adapters).
