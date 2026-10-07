# QueryAdapter <Badge type="info" text="@vuqs/core" />

The contract every adapter satisfies.

## Usage

```ts
import type { ParsedQuery, QueryAdapter } from '@vuqs/core'
import { shallowRef } from 'vue'

const query = shallowRef<ParsedQuery>({})
const adapter: QueryAdapter = {
  query,
  navigate(next) {
    query.value = next
  },
}
```

## Type

```ts
interface QueryAdapter {
  debugName?: string
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: QueryStateNavigate
  defaultOptions?: QueryAdapterDefaultOptions
}
```

## Properties

| Property | Type | Description |
| --- | --- | --- |
| `debugName` | `string` | Optional adapter identity used by opt-in diagnostics. |
| `query` | `MaybeRefOrGetter<ParsedQuery>` | The current parsed query, as a ref, getter, or plain value. |
| `navigate` | `QueryStateNavigate` | Applies the next query. On completion, `query` exposes the final state, including normalization and redirects. Returns `void` or `Promise<void>`; throws or rejects on failure or cancellation. |
| `defaultOptions` | `QueryAdapterDefaultOptions` | Optional adapter defaults at the bottom of the [precedence chain](/guide/query-state/navigation-options#precedence). |

Adapter object identity defines a runtime boundary. Bindings using the same adapter
share one optimistic overlay, write queue, and transaction-start registry. Bindings
using different adapter objects are isolated, even when their query paths overlap.

The queue removes only the versions belonging to a completed attempt. A later
write to the same path remains pending, even when it has the same value. A rejected
promise or a synchronous error rolls back the attempt's current versions.

## QueryAdapterDefaultOptions

Defaults an adapter applies to every write. Extends `NavigateOptions`.

```ts
interface QueryAdapterDefaultOptions extends NavigateOptions {
  throttleMs?: number
  clearOnDefault?: boolean
}
```

### Properties

| Property | Type | Description |
| --- | --- | --- |
| `history` | `'replace' \| 'push'` | Optional. Push a history entry or replace the current one. |
| `scroll` | `boolean` | Optional. Whether navigation scrolls, forwarded to the adapter. |
| `throttleMs` | `number` | Optional. Coalesce writes within this many milliseconds. |
| `clearOnDefault` | `boolean` | Optional. Drop a value from the URL when it equals its resolved default. |

See [Navigation & options](/guide/query-state/navigation-options#precedence) for how
these compose with per-instance and per-call options.

## NavigateOptions

```ts
interface NavigateOptions {
  history?: 'replace' | 'push'
  scroll?: boolean
}
```

## QueryStateNavigate

```ts
type QueryStateNavigate = (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>
```

## Related guide

[Bring your own adapter](/guide/getting-started/adapters#bring-your-own-adapter).
