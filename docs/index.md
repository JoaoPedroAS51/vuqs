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
    title: Typed state in the URL
    details: A ref bound to a query param. It writes the URL, and the URL writes it back.
  - icon: 🧬
    title: Not everything is a string
    details: A codec turns ?page=2 into the number 2 and back. Built-ins cover common types, and you can define your own.
  - icon: 🪝
    title: It behaves like a ref
    details: v-model, page++, whatever you'd do to a ref. Simultaneous writes end up in one navigation.
  - icon: 🧭
    title: Your router does the navigating
    details: vuqs builds the next query and an adapter hands it to your router. vue-router's is included.
  - icon: 🧩
    title: Modules for everything else
    details: The core does URL state. Anything on top is a module you compose with .use(), including your own.
  - icon: 🧪
    title: Testing and debugging
    details: A testing adapter for asserting URL writes, and structured debug events when something looks wrong.
---

## Put view state in the URL

Search, filters, sort, and pagination all belong in the query string. vuqs binds
them to typed, reactive refs: you read values back as the types you declared, and
write them like any ref.

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

<div class="vp-doc" style="margin-top: 2rem">

> [!TIP]
> New here? Start with **[Installation](/guide/getting-started/installation)**, then
> read **[Concepts](/guide/essentials/concepts)** for codecs, params, schemas, and writes.

</div>
