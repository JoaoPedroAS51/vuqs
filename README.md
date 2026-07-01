# vuqs

> Type-safe query state for Vue.

[![npm version](https://img.shields.io/npm/v/@vuqs/core.svg)](https://www.npmjs.com/package/@vuqs/core)
[![CI](https://img.shields.io/github/actions/workflow/status/JoaoPedroAS51/vuqs/ci.yml?branch=main&label=CI)](https://github.com/JoaoPedroAS51/vuqs/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlejs/size/@vuqs/core?label=bundle%20%28gzip%29)](https://bundlejs.com/?q=@vuqs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Keep search, filters, sort, and pagination in the URL, with full type safety.
vuqs makes the query string a typed, reactive part of your app: the link your
user shares restores the exact view they were looking at, with no separate ref to
keep in sync.

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

- 🔗 **The URL is your state.** Bind query params to typed, reactive refs.
- 🧬 **Codecs, not strings.** `parse` and `serialize` travel as one unit, so a value and its URL form never drift.
- 🪝 **Reactive by design.** `v-model` works, and concurrent writes coalesce into a single navigation.
- 🧭 **Router-agnostic.** A tiny adapter plugs in vue-router, Nuxt, or anything that reads and writes a query.
- 🧩 **Composable.** Opt-in modules layer behavior onto your state with `.use()`. Tree-shakeable.
- 🪶 **Tiny and typed.** Zero runtime dependencies, side-effect free, built for Vue.

## Documentation

📚 **[vuqs.dev](https://vuqs.dev)** has the full guide, module docs, and API reference.

- [Getting started](https://vuqs.dev/guide/getting-started/installation)
- [Concepts](https://vuqs.dev/guide/essentials/concepts)
- [Codecs](https://vuqs.dev/guide/codecs/built-in)
- [Modules](https://vuqs.dev/modules/)
- [API reference](https://vuqs.dev/api/)

Using Nuxt? [`@vuqs/nuxt`](https://vuqs.dev/nuxt/getting-started) adds auto-imports
and the vue-router adapter out of the box.

## Install

```bash
pnpm add @vuqs/core
```

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

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
