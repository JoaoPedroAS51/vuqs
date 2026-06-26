# @vuqs/nuxt

Nuxt module for [vuqs](https://github.com/JoaoPedroAS51/vuqs). It auto-imports the
query-state composables and provides the `vue-router` adapter app-wide.

## Setup

```bash
pnpm add @vuqs/core @vuqs/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
})
```

`useQueryState`, `useQueryStates`, `defineQueryParam`, the `codecs` namespace and
more are auto-imported, and the adapter is provided:

```vue
<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault(''))
</script>

<template>
  <input v-model="search">
</template>
```

## What it registers

**Auto-imports** (from `@vuqs/core`):

- Composables: `useQueryState`, `useQueryStates`, `useQueryAdapter`,
  `provideQueryAdapter`, `defineQueryParam`, `createSerializer`
- Codecs: `codecs`, `createCodec` — `codecs` is a single namespace object
  (`codecs.string`, `codecs.integer`, …), so it's one auto-imported name, not one
  per codec
- Modules: the composable modules from `@vuqs/core/modules`

**Adapter:** a plugin provides `createVueRouterAdapter()` on the Vue app via
vuqs's `installQueryAdapter`, so the composables resolve the router app-wide.

## Options

Configured under the `vuqs` key:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    // Turn auto-imports on/off, or pick groups
    autoImports: {
      composables: true,
      codecs: true,
      modules: true,
    },
    // Adapter defaults; per-call/per-composable options still win
    adapter: {
      defaultOptions: { history: 'replace' },
    },
  },
})
```

| Option        | Type                                  | Default | Description                                                                 |
| ------------- | ------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `autoImports` | `boolean \| AutoImportsOptions`       | `true`  | Register vuqs APIs as auto-imports. `false` registers none.                |
| `adapter`     | `boolean \| { defaultOptions? }`      | `true`  | Provide the `vue-router` adapter app-wide. `false` to provide your own.    |

### Bring your own adapter

Set `adapter: false` and provide one yourself (for example with `qs` for nested
keys, or a non-router source):

```ts
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

## Nested keys

vue-router's default query parser is flat, so nested keys such as `filters.sort`
won't round-trip. To use them, configure the router with `qs` via
`app/router.options.ts` — see the
[vuqs adapter docs](https://github.com/JoaoPedroAS51/vuqs).
