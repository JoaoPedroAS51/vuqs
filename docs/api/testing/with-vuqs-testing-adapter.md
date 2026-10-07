# withVuqsTestingAdapter <Badge type="tip" text="@vuqs/core/adapters/testing" />

Returns a Vue plugin that builds a testing adapter and installs it on an app, for
use with `@vue/test-utils`' `global.plugins`.

## Usage

```ts
import { withVuqsTestingAdapter } from '@vuqs/core/adapters/testing'
import { createApp } from 'vue'

const app = createApp({})
app.use(withVuqsTestingAdapter({ searchParams: '?count=42' }))
```

## Type

```ts
function withVuqsTestingAdapter(options?: TestingAdapterOptions): (app: App) => void
```

## Parameters

- `options?: TestingAdapterOptions`
  - The same options as [`createTestingAdapter`](/api/testing/create-testing-adapter).

## Return value

- `plugin: (app: App) => void`
  - A Vue plugin. When you also need the adapter reference (to read
    `adapter.query.value`), call `createTestingAdapter` and install it yourself
    instead.

## Related guide

[Testing](/guide/testing).
