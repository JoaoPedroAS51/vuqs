<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'
import { onScopeDispose, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const search = useQueryState('q', codecs.string.withDefault(''), { history: 'push' })
const guard = ref<'allow' | 'block' | 'hold'>('allow')
const status = ref('idle')
let release: (() => void) | undefined

onScopeDispose(router.beforeEach(async () => {
  if (guard.value === 'block') {
    status.value = 'blocked'
    return false
  }
  if (guard.value === 'hold') {
    guard.value = 'allow'
    status.value = 'waiting'
    await new Promise<void>((resolve) => {
      release = resolve
    })
  }
}))

onScopeDispose(router.afterEach((_to, _from, failure) => {
  status.value = failure ? 'blocked' : 'committed'
}))

function releaseNavigation() {
  release?.()
  release = undefined
}
</script>

<template>
  <main>
    <h1>Navigation</h1>
    <label>
      Search
      <input v-model="search" type="search">
    </label>
    <output data-testid="selection">{{ search }}</output>
    <output data-testid="guard-status">{{ status }}</output>
    <button @click="guard = 'block'">
      Block navigation
    </button>
    <button @click="guard = 'allow'">
      Allow navigation
    </button>
    <button @click="guard = 'hold'">
      Hold next navigation
    </button>
    <button :disabled="status !== 'waiting'" @click="releaseNavigation">
      Release navigation
    </button>
  </main>
</template>
