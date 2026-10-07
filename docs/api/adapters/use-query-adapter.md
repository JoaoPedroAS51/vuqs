# useQueryAdapter <Badge type="info" text="@vuqs/core" />

Reads the adapter provided by an ancestor.

## Usage

```ts
import { useQueryAdapter } from '@vuqs/core'

const adapter = useQueryAdapter()
const defaults = adapter?.defaultOptions
```

## Type

```ts
function useQueryAdapter(): QueryAdapter | undefined
```

## Return value

- `adapter: QueryAdapter | undefined`
  - The provided [`QueryAdapter`](/api/adapters/query-adapter), or `undefined` when
    there is no injection context or no adapter. Safe to call outside a component.

## Related guide

[Adapters](/guide/getting-started/adapters).
