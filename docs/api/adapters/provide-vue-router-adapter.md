# provideVueRouterAdapter <Badge type="tip" text="@vuqs/core/adapters/vue-router" />

`provideQueryAdapter(createVueRouterAdapter(options))` in one call.

## Usage

```ts
import { provideVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })
```

## Type

```ts
function provideVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter
```

## Parameters

- `options?: VueRouterAdapterOptions`
  - Same as [`createVueRouterAdapter`](/api/adapters/create-vue-router-adapter).

## Return value

- `adapter: QueryAdapter`
  - The created adapter, already provided to descendant components.

## Related guide

[Adapters](/guide/getting-started/adapters).
