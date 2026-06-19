# Getting started

`@vuqs/nuxt` auto-imports the composables and codecs, and provides the
[vue-router adapter](/guide/getting-started/adapters#vue-router) app-wide.

## Install

```bash
pnpm add @vuqs/core @vuqs/nuxt
```

Register it in `nuxt.config`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
})
```

The composables and codecs are now auto-imported, and the adapter is installed
app-wide:

```vue
<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault(''))
</script>

<template>
  <input v-model="search">
</template>
```

## Registered APIs

- **[Auto-imports](/nuxt/auto-imports):** the composables, the `codecs` namespace,
  and the [modules](/modules/).
- **[The adapter](/nuxt/adapter):** the vue-router adapter, installed on the Vue
  app so every composable resolves it.

Use [`vuqs` configuration](/nuxt/configuration) to select auto-import groups, set
adapter defaults, or disable the built-in adapter.

## Compatibility

Works with **Nuxt 3 and Nuxt 4** (`compatibility: { nuxt: '>=3.0.0' }`).
