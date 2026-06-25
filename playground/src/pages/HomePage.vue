<script setup lang="ts">
import { RouterLink } from 'vue-router'

const demos = [
  { to: '/single', title: 'Single + codecs', text: 'useQueryState bound to one key at a time across every built-in codec: string, integer, float, boolean, literal, arrayOf, isoDate. Defaults and .clear() included.' },
  { to: '/grouped', title: 'Grouped states', text: 'useQueryStates binding a search/sort/page group that drives a list. Toggle history: push | replace and watch writes coalesce into one navigation.' },
  { to: '/store', title: 'Three states', text: 'The withRuntimeDefaults module adds selected (URL), runtime-loaded defaults (never serialized), and the derived effective read model.' },
  { to: '/context', title: 'Context', text: 'The withContext module: reset / preserve / validity. Switch tabs and some filters persist, some reset, invalid ones drop — all in one navigation.' },
]
</script>

<template>
  <section class="doc">
    <div class="page-head">
      <h2>Overview</h2>
      <p>
        Each page is a focused demo. Edit a control and watch the live-state panel and the URL
        update — or edit the URL directly and watch the UI react. Reload anytime: state survives
        because it lives in the query string.
      </p>
    </div>

    <div class="overview">
      <RouterLink v-for="demo in demos" :key="demo.to" class="ov-card" :to="demo.to">
        <h3>{{ demo.title }}</h3>
        <p>{{ demo.text }}</p>
      </RouterLink>
    </div>
  </section>
</template>
