<script setup lang="ts">
import { RouterLink } from 'vue-router'

const demos = [
  { to: '/single', title: 'Single + codecs', text: 'Bind one query key with several built-in codecs and try defaults and .clear().' },
  { to: '/grouped', title: 'Grouped states', text: 'Bind search, sort, and page as one state object. Switch between push and replace history while consecutive writes coalesce into one navigation.' },
  { to: '/store', title: 'Three states', text: 'Layer runtime defaults under URL selections without serializing the defaults.' },
  { to: '/context', title: 'Context', text: 'Preserve, reset, or restrict params while switching contexts in one navigation.' },
]
</script>

<template>
  <section class="doc">
    <div class="page-head">
      <h2>Overview</h2>
      <p>
        Change a control to update the URL and live-state panel. Edit the URL to update the controls.
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
