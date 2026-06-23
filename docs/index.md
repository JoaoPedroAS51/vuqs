---
layout: home

hero:
  name: vuqs
  text: Typed URL state, without the boilerplate
  tagline: Codecs bind query params to typed, reactive refs in Vue 3 — with defaults and batched writes.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why vuqs?
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/JoaoPedroAS51/vuqs

features:
  - icon: 🔗
    title: The URL is your state
    details: Bind search, sort, pagination, and filters to query keys and read them back as typed values — no separate ref to keep in sync.
  - icon: 🧬
    title: Codecs, not strings
    details: A codec pairs parse with serialize as one unit, so a value and its URL form never drift. Strings, numbers, booleans, dates, arrays, enums, and JSON ship built-in.
  - icon: 🪝
    title: Reactive by design
    details: useQueryState returns a writable ref; useQueryStates returns a reactive value map. v-model just works, and writes coalesce into a single navigation.
  - icon: 🧭
    title: Router-agnostic core
    details: The core knows nothing about your router. A tiny adapter plugs in vue-router or Nuxt — or anything that can read and write a query.
  - icon: 🗂️
    title: A store when you need one
    details: "@vuqs/store adds three states — selected, runtime defaults, and a derived effective — plus context-aware reset for tabs and wizards."
  - icon: 🧩
    title: Tiny and tree-shakeable
    details: No runtime dependencies, side-effect free, and built for Vue 3.5+. Pay only for the codecs and helpers you import.
---

## At a glance

```vue
<script setup lang="ts">
import { codecs, useQueryState } from 'vuqs'

// ?q=laptop&page=2  ⇄  reactive, typed refs
const q = useQueryState('q', codecs.string.withDefault(''))
const page = useQueryState('page', codecs.integer.withDefault(1))
</script>

<template>
  <input v-model="q" placeholder="Search…">
  <button @click="page = page + 1">Next page</button>
  <p>Searching “{{ q }}” — page {{ page }}</p>
</template>
```

Each field is a typed, writable ref bound to a query key: assigning it writes the
URL, and the URL writes it back.

<div class="vp-doc" style="margin-top: 2rem">

> [!TIP]
> New here? Start with **[Getting started](/guide/getting-started)** for a five-minute
> setup, then skim **[Core concepts](/guide/concepts)** for the mental model.

</div>
