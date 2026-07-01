# Getting started

`@vuqs/nuxt` auto-imports the composables and codecs, and provides the
[vue-router adapter](/guide/getting-started/adapters#vue-router) app-wide.

It is optional. Nuxt's router **is** vue-router, so the manual setup works in a
plain Nuxt app; the module handles the wiring for you.

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

That is all the setup most apps need. The composables and codecs are now
auto-imported, and the adapter is installed app-wide:

```vue
<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault(''))
</script>

<template>
  <input v-model="search">
</template>
```

## What it registers

- **[Auto-imports](/nuxt/auto-imports):** the composables, the `codecs` namespace,
  and the [modules](/modules/), so you skip the import lines.
- **[The adapter](/nuxt/adapter):** the vue-router adapter, installed on the Vue
  app so every composable resolves it.

Tune both, or replace the adapter, through the
[`vuqs` configuration](/nuxt/configuration).

## Compatibility

Works with **Nuxt 3 and Nuxt 4** (`compatibility: { nuxt: '>=3.0.0' }`).
