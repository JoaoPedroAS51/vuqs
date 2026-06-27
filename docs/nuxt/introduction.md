# @vuqs/nuxt

The Nuxt module auto-imports the composables and codecs and provides the
[vue-router adapter](/guide/adapters#vue-router) app-wide.

It's optional. Nuxt's router **is** vue-router, so the same setup works manually
in a plain Nuxt app; the module handles the wiring.

```bash
pnpm add @vuqs/core @vuqs/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
})
```

Then, in a component:

```vue
<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault(''))
</script>

<template>
  <input v-model="search">
</template>
```

## What it registers

### Auto-imports

| Group | Names | From |
| --- | --- | --- |
| Composables | `useQueryState`, `useQueryStates`, `useQueryAdapter`, `provideQueryAdapter`, `defineQueryParam`, `defineQueryModule`, `createSerializer` | `@vuqs/core` |
| Codecs | `codecs`, `createCodec` | `@vuqs/core` |
| Modules | the composable [modules](/modules/introduction) | `@vuqs/core/modules` |

`codecs` is a single namespace object, so it's one auto-imported name
(`codecs.string`, `codecs.integer`, …), not one per codec.

The Modules group registers every module exported from `@vuqs/core/modules`, so new
modules become available without changing your config.

### The adapter

A plugin provides [`createVueRouterAdapter()`](/api/adapters#createvuerouteradapter)
on the Vue app via [`installQueryAdapter`](/api/composables#installqueryadapter).
Because it's provided per request, SSR stays isolated — each request gets its own
router and adapter.

## Configuration

All options live under the `vuqs` key:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    autoImports: true,
    adapter: { defaultOptions: { history: 'replace' } },
  },
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autoImports` | `boolean \| { composables?, codecs?, modules? }` | `true` | Register vuqs APIs as auto-imports. `false` registers none; an object toggles each group. |
| `adapter` | `boolean \| { defaultOptions? }` | `true` | Provide the vue-router adapter app-wide. `false` disables it so you can provide your own. |

The full option types:

```ts
interface ModuleOptions {
  autoImports?: boolean | AutoImportsOptions // default: true
  adapter?: boolean | AdapterOptions         // default: true
}

interface AutoImportsOptions {
  composables?: boolean // useQueryState(s), use/provideQueryAdapter, defineQueryParam/Module, createSerializer
  codecs?: boolean      // the `codecs` namespace and `createCodec`
  modules?: boolean     // the composable modules from `@vuqs/core/modules`
}

interface AdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}
```

An object enables the listed groups; omitted groups default to `true`.

### Pick which groups to auto-import

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    autoImports: {
      composables: true,
      codecs: false, // import `codecs` manually instead
      modules: true,
    },
  },
})
```

### Adapter defaults

`adapter.defaultOptions` sets a baseline for every write — for instance, default
to `replace` so filter tweaks don't flood history:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { adapter: { defaultOptions: { history: 'replace', clearOnDefault: true } } },
})
```

These sit at the bottom of the [precedence chain](/guide/navigation-options#precedence):
a per-call or per-composable option still wins. They're also exposed through
`runtimeConfig.public.vuqs.adapter`, so they can be overridden per environment like
any public runtime config.

## Bring your own adapter

Set `adapter: false` to take over provisioning — for a non-router query source,
or to wire `qs` for [nested keys](#nested-keys):

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { adapter: false },
})
```

```ts
// plugins/vuqs.ts
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'

export default defineNuxtPlugin((nuxtApp) => {
  installQueryAdapter(nuxtApp.vueApp, createVueRouterAdapter({ router: useRouter() }))
})
```

`installQueryAdapter` is the app-level counterpart to `provideQueryAdapter` —
it provides the adapter on the Vue app rather than a component instance, which is
why a plugin can register it.

## Nested keys

vue-router's default query parser is flat, so dotted keys like `filters.sort`
won't round-trip ([more](/guide/nested-keys)). To use them, configure the router
with `qs` in `app/router.options.ts`:

```ts
// app/router.options.ts
import type { RouterConfig } from '@nuxt/schema'
import qs from 'qs'

export default {
  parseQuery: qs.parse as never,
  stringifyQuery: qs.stringify as never,
} satisfies RouterConfig
```

Flat, top-level keys work without this. Arrays (`?tags=a&tags=b`) and nesting
both rely on it.

## Compatibility

Works with **Nuxt 3 and Nuxt 4** (`compatibility: { nuxt: '>=3.0.0' }`).
