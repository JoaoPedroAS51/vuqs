# vuqs

**Typed URL state for Vue 3 — without the boilerplate.**

Keep search, filters, sort, and pagination in the URL with full type safety. The
URL becomes the single source of truth for view state — typed, reactive, and
bound to your router.

```bash
pnpm add vuqs
```

## Quick start

Provide an adapter once, near the root of your app:

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provideVueRouterAdapter } from 'vuqs/adapters/vue-router'

provideVueRouterAdapter()
</script>
```

Then bind state to the URL anywhere below it:

```vue
<script setup lang="ts">
import { codecs, useQueryState } from 'vuqs'

const q = useQueryState('q', codecs.string.withDefault(''))
const page = useQueryState('page', codecs.integer.withDefault(1))
</script>

<template>
  <input v-model="q" placeholder="Search…">
  <button @click="page++">Next page</button>
  <p>Searching “{{ q }}” — page {{ page }}</p>
</template>
```

`q` and `page` are writable refs bound to the `q` and `page` query keys: assigning
either writes the URL, and the URL writes it back.

Need a whole filter group? [`useQueryStates`](https://JoaoPedroAS51.github.io/vuqs/guide/use-query-states)
binds many keys at once and coalesces multi-field writes into a single navigation.

## Packages

| Package | What it does |
| --- | --- |
| [`vuqs`](https://JoaoPedroAS51.github.io/vuqs/guide/introduction) | The core — codecs, `useQueryState`/`useQueryStates`, adapters, serializer. |
| [`@vuqs/store`](https://JoaoPedroAS51.github.io/vuqs/store/introduction) | An opinionated store — runtime defaults and context-aware reset for tabs and wizards. |

## Features

- 🔗 **The URL is your state** — bind filters to query keys and read them back as typed values, with no separate ref to sync.
- 🧬 **Codecs, not strings** — strings, numbers, booleans, dates, arrays, enums, JSON, or your own.
- 🪝 **Reactive** — `useQueryState` returns a writable ref; `useQueryStates` a reactive map. `v-model` just works.
- 🧭 **Router-agnostic** — a tiny adapter plugs in vue-router, Nuxt, or anything.
- 🗂️ **A store when you need one** — three states (`selected` / `defaults` / `effective`) and context reset.
- 🧩 **Tiny & tree-shakeable** — no runtime dependencies, built for Vue 3.5+.

## Documentation

📚 **[Full documentation →](https://JoaoPedroAS51.github.io/vuqs/)**

- [Getting started](https://JoaoPedroAS51.github.io/vuqs/guide/getting-started)
- [Core concepts](https://JoaoPedroAS51.github.io/vuqs/guide/concepts)
- [Codecs](https://JoaoPedroAS51.github.io/vuqs/guide/codecs)
- [@vuqs/store](https://JoaoPedroAS51.github.io/vuqs/store/introduction)
- [API reference](https://JoaoPedroAS51.github.io/vuqs/api/)

## Requirements

- Vue 3.5+
- `vue-router` 4 is an optional peer dependency (used only by the vue-router adapter)

## Development

This is a pnpm monorepo.

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # run unit + type tests
pnpm --filter @vuqs/playground dev   # interactive playground
pnpm --filter @vuqs/docs dev         # docs site
```

## Acknowledgements

Inspired by [nuqs](https://nuqs.47ng.com/), the type-safe query state library for
React. vuqs is a ground-up Vue implementation, adding its own runtime defaults and
context-aware store on top.

## License

[MIT](./LICENSE)
