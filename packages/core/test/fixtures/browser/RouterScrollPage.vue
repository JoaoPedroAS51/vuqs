<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'
import { useRoute, useRouter } from 'vue-router'
import ScrollPage from './ScrollPage.vue'

const router = useRouter()
const route = useRoute()
const page = useQueryState('page', codecs.integer.withDefault(1))

function pushAndScroll() {
  page.set(page.value + 1, { history: 'push', scroll: true })
}

function navigateFromApp() {
  void router.push({ query: { ...route.query, page: String(page.value + 1) } })
}

function replaceScrollBehavior() {
  router.options.scrollBehavior = () => ({ top: 100 })
}
</script>

<template>
  <ScrollPage>
    <button @click="pushAndScroll">
      Push and reset scroll
    </button>
    <button @click="navigateFromApp">
      Application navigation
    </button>
    <button @click="replaceScrollBehavior">
      Replace router scroll behavior
    </button>
  </ScrollPage>
</template>
