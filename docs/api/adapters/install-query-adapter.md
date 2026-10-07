# installQueryAdapter <Badge type="info" text="@vuqs/core" />

The app-level counterpart to `provideQueryAdapter`: provides the adapter on the Vue
`App` rather than the current component instance.

## Usage

Install the adapter during app setup. The [Nuxt module](/nuxt/getting-started)
registers it from a plugin.

```ts
import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

const app = createApp({})
const router = createRouter({ history: createWebHistory(), routes: [] })
app.use(router)
installQueryAdapter(app, createVueRouterAdapter({ router }))
```

## Type

```ts
function installQueryAdapter(app: App, adapter: QueryAdapter): void
```

## Parameters

- `app: App`
  - The Vue [application instance](https://vuejs.org/api/application.html).
- `adapter: QueryAdapter`
  - The adapter to install app-wide.

## Return value

- `void`
  - Installs the adapter on the Vue app.

## Related guide

[Adapters](/guide/getting-started/adapters).
