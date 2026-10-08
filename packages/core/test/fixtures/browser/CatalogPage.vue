<script setup lang="ts">
import { useTemplateRef } from 'vue'
import FilterControls from './FilterControls.vue'
import SearchControls from './SearchControls.vue'

const search = useTemplateRef('search')
const filters = useTemplateRef('filters')

function applyPreset() {
  search.value!.set('sale', { history: 'push' })
  filters.value!.patch({ page: 3, tags: ['red', 'blue'] }, { history: 'push' })
}

function clear() {
  search.value!.clear()
  filters.value!.clear()
}
</script>

<template>
  <main>
    <h1>Catalog</h1>
    <SearchControls ref="search" />
    <FilterControls ref="filters" />
    <button @click="applyPreset">
      Apply preset
    </button>
    <button @click="clear">
      Clear all
    </button>
  </main>
</template>
