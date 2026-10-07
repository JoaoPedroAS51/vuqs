# provideQueryAdapter <Badge type="info" text="@vuqs/core" />

Provides a [`QueryAdapter`](/api/adapters/query-adapter) to descendant components, so
their composables resolve `query`/`navigate` automatically.

## Usage

```ts
import { provideQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideQueryAdapter(createVueRouterAdapter())
```

## Type

```ts
function provideQueryAdapter(adapter: QueryAdapter): void
```

## Parameters

- `adapter: QueryAdapter`
  - The adapter to provide. Call from a component `setup`.

## Return value

- `void`
  - Provides the adapter to descendant components.

## Related guide

[Adapters](/guide/getting-started/adapters).
