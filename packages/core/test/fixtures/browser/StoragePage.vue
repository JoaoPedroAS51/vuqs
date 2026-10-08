<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'
import { createWebStorage, withStorage } from '@vuqs/core/modules'

const { values, clear, storage } = useQueryStates({
  q: codecs.string.withDefault(''),
  page: codecs.integer.withDefault(1),
}).use(withStorage({
  key: 'vuqs:e2e:filters',
  storage: createWebStorage(() => localStorage),
}))
const { status } = storage
</script>

<template>
  <main>
    <h1>Storage</h1>
    <label>
      Search
      <input v-model="values.q" type="search">
    </label>
    <label>
      Page
      <input v-model.number="values.page" type="number">
    </label>
    <output data-testid="storage-status">{{ status }}</output>
    <button @click="clear()">
      Clear all
    </button>
  </main>
</template>
