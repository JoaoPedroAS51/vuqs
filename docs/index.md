---
layout: home

hero:
  name: vuqs
  text: Type-safe query state for Vue.
  tagline: The URL is the single source of truth for view state. Typed, reactive, and bound to your router.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started/installation
    - theme: alt
      text: Why vuqs?
      link: /guide/going-further/about
    - theme: alt
      text: View on GitHub
      link: https://github.com/JoaoPedroAS51/vuqs

features:
  - icon: 🔗
    title: The URL is your state
    details: Bind query params to typed, reactive refs. One source of truth for view state, with no separate ref to keep in sync.
  - icon: 🧬
    title: Codecs, not strings
    details: A codec pairs parse with serialize as one unit, so a value and its URL form never drift. Rich built-ins cover the common types, or build your own.
  - icon: 🪝
    title: Reactive by design
    details: useQueryState returns a writable ref; useQueryStates returns a reactive map. v-model works, and concurrent writes coalesce into a single navigation.
  - icon: 🧭
    title: Router-agnostic
    details: The core knows nothing about your router. A tiny adapter plugs in vue-router, Nuxt, or anything that reads and writes a query.
  - icon: 🧩
    title: Composable and extensible
    details: Opt-in modules layer behavior onto your state with .use(). Tree-shakeable, so you pay only for what you import.
  - icon: 🧱
    title: Build URLs, don't navigate
    details: Turn values into a query string for links and redirects with the same schema, without binding to the router.
  - icon: 🧪
    title: Testable
    details: First-class testing utilities verify URL writes and codec round-trips without mounting a router.
  - icon: 🪶
    title: Tiny and typed
    details: Zero runtime dependencies, side-effect free, built for Vue, with full type inference.
---

## Your state already lives in the URL

Search, filters, sort, and pagination belong in the query string, where a shared
link restores the exact view. vuqs makes that state typed and reactive: you read
values back as the types you declared, and write them like any ref.

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

Assigning a param writes the URL; the URL writes it back.

<div class="vp-doc" style="margin-top: 2rem">

> [!TIP]
> New here? Start with **[Installation](/guide/getting-started/installation)**, then
> read **[Concepts](/guide/essentials/concepts)** for the mental model.

</div>
