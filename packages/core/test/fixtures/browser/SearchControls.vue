<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'

const search = useQueryState('q', codecs.string.withDefault(''))
const { set, clear } = search

defineExpose({ set, clear })
</script>

<template>
  <section aria-label="Search">
    <label>
      Search
      <input v-model="search" type="search">
    </label>
    <button @click="set('pushed', { history: 'push' })">
      Push search
    </button>
    <button @click="set('replaced', { history: 'replace' })">
      Replace search
    </button>
  </section>
</template>
