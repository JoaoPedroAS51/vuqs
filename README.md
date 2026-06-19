# vuqs

> Type-safe query state for Vue.

[![npm version](https://img.shields.io/npm/v/@vuqs/core.svg)](https://www.npmjs.com/package/@vuqs/core)
[![CI](https://img.shields.io/github/actions/workflow/status/JoaoPedroAS51/vuqs/ci.yml?branch=main&label=CI)](https://github.com/JoaoPedroAS51/vuqs/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlejs/size/@vuqs/core?label=bundle%20%28gzip%29)](https://bundlejs.com/?q=@vuqs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Keep search, filters, sort, and pagination in the URL. vuqs binds each query
param to a typed, reactive ref, so there is no second copy of the state to keep
in sync.

```vue
<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'

const search = useQueryState('q', codecs.string.withDefault(''))
const page = useQueryState('page', codecs.integer.withDefault(1))
</script>

<template>
  <input v-model="search" placeholder="Search…">
  <button @click="page++">Next page</button>
  <p>Searching “{{ search }}” on page {{ page }}</p>
</template>
```

## Highlights

- 🔗 **Typed state in the URL.** A ref bound to a query param. It writes the URL, and the URL writes it back.
- 🧬 **Not everything is a string.** A codec turns ?page=2 into the number 2 and back. Built-ins cover common types, and you can define your own.
- 🪝 **It behaves like a ref.** v-model, page++, whatever you'd do to a ref. Simultaneous writes end up in one navigation.
- 🧭 **Your router does the navigating.** vuqs builds the next query and an adapter hands it to your router. vue-router's is included.
- 🧩 **Modules for everything else.** The core does URL state. Anything on top is a module you compose with .use(), including your own.
- 🧪 **Testing and debugging.** A testing adapter for asserting URL writes, and structured debug events when something looks wrong.

## Documentation

📚 **[vuqs.dev](https://vuqs.dev)** has the full guide, module docs, and API reference.

- [Getting started](https://vuqs.dev/guide/getting-started/installation)
- [Concepts](https://vuqs.dev/guide/essentials/concepts)
- [Codecs](https://vuqs.dev/guide/codecs/built-in)
- [Modules](https://vuqs.dev/modules/)
- [API reference](https://vuqs.dev/api/)

Using Nuxt? [`@vuqs/nuxt`](https://vuqs.dev/nuxt/getting-started) adds auto-imports
and installs the vue-router adapter.

## Install

```bash
pnpm add @vuqs/core
```

> [!WARNING]
> vuqs is in active development. Minor releases may include breaking changes.
> Pin an exact version in your `package.json` and review the changelog before
> upgrading.

<details><summary>npm / yarn / bun</summary>

```bash
npm install @vuqs/core
yarn add @vuqs/core
bun add @vuqs/core
```

</details>

Requires Vue 3.5+ and Node 22+. ESM-only.

## Usage

Install an adapter on the app, after the router:

```ts
// main.ts
import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

const app = createApp(App)

app.use(router)
installQueryAdapter(app, createVueRouterAdapter({ router }))

app.mount('#app')
```

Bind a single param with `useQueryState`, or a group with `useQueryStates`:

```ts
import { codecs, useQueryStates } from '@vuqs/core'

const { values } = useQueryStates({
  q: codecs.string.withDefault(''),
  page: codecs.integer.withDefault(1),
})

values.q = 'vue' // navigates
values.page = 2 // coalesced into the same navigation
```

## Acknowledgements

Inspired by [nuqs](https://nuqs.dev), which brought type-safe URL state to React.
vuqs takes the idea to Vue with its own architecture.

## License

[MIT](./LICENSE)
