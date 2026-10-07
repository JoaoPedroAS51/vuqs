# provideBrowserHistoryAdapter <Badge type="tip" text="@vuqs/core/adapters/browser-history" />

Creates a browser History API adapter and provides it to descendant components.

## Usage

```ts
import { provideBrowserHistoryAdapter } from '@vuqs/core/adapters/browser-history'

provideBrowserHistoryAdapter({ defaultOptions: { history: 'replace' } })
```

## Type

```ts
function provideBrowserHistoryAdapter(options?: BrowserHistoryAdapterOptions): BrowserHistoryAdapter
```

## Parameters

- `options?: BrowserHistoryAdapterOptions`
  - The same options as [`createBrowserHistoryAdapter`](/api/adapters/create-browser-history-adapter).

## Return value

- `adapter: BrowserHistoryAdapter`
  - The created adapter, already provided. Call from a component `setup` in the browser.
  - Disposed automatically when the component's effect scope stops.

## Related guide

[Adapters](/guide/getting-started/adapters).
