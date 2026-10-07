# Getting started

`@vuqs/nuxt` installs the query adapter for Nuxt's router and registers the composables, codecs, and built-in module factories as auto-imports. Apps without pages are supported through Nuxt's minimal router.

## Install

```bash
pnpm add @vuqs/core @vuqs/nuxt
```

Register the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
})
```

## Usage

```vue
<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault(''))
</script>

<template>
  <input v-model="search">
</template>
```

Writing to `search` updates the URL through the installed adapter. No per-component provider is required.

## Next steps

- [Configuration](/nuxt/configuration): auto-import groups, adapter defaults, and debug targets.
- [Routing and adapters](/nuxt/adapter): nested queries and custom adapters.
- [Query state](/guide/query-state/use-query-states): grouped values and batch writes.

## Compatibility

The module declares support for Nuxt 3 and Nuxt 4 (`nuxt: '>=3.0.0'`).
