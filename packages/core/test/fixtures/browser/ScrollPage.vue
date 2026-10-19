<script setup lang="ts">
import type { NavigateOptions } from '@vuqs/core'
import { codecs, useQueryState } from '@vuqs/core'

const page = useQueryState('page', codecs.integer.withDefault(1))
const rows = useQueryState('rows', codecs.integer.withDefault(0))

function nextPage(options?: NavigateOptions) {
  page.set(page.value + 1, options)
}

function coalesce() {
  page.set(page.value + 1, { scroll: false })
  page.set(page.value + 1, { scroll: true })
}

function growAndScroll() {
  rows.set(rows.value + 2, { scroll: { top: 2500 } })
}
</script>

<template>
  <main>
    <nav class="toolbar" aria-label="Scroll writes">
      <button @click="nextPage({ scroll: true })">
        Scroll to top
      </button>
      <button @click="nextPage({ scroll: { top: 400, behavior: 'smooth' } })">
        Scroll to 400 smoothly
      </button>
      <button @click="nextPage({ scroll: { top: 0 } })">
        Scroll vertically to 0
      </button>
      <button @click="nextPage({ scroll: false })">
        Keep position
      </button>
      <button @click="nextPage()">
        No scroll option
      </button>
      <button @click="coalesce">
        Coalesce false and true
      </button>
      <button @click="growAndScroll">
        Grow and scroll
      </button>
      <slot />
    </nav>
    <output data-testid="page">{{ page }}</output>
    <div class="content" />
    <div v-for="row in rows" :key="row" class="row" />
  </main>
</template>

<style scoped>
.toolbar {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.content {
  width: 3000px;
  height: 2000px;
}

.row {
  height: 1000px;
}
</style>
