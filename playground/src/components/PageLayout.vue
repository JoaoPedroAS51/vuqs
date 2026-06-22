<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

interface UrlPart { kind: 'sep' | 'key' | 'eq' | 'val', text: string }

const urlParts = computed<UrlPart[]>(() => {
  const parts: UrlPart[] = []
  let first = true

  for (const [key, raw] of Object.entries(route.query)) {
    const values = Array.isArray(raw) ? raw : [raw]

    for (const value of values) {
      parts.push({ kind: 'sep', text: first ? '?' : '&' })
      parts.push({ kind: 'key', text: key })
      parts.push({ kind: 'eq', text: '=' })
      parts.push({ kind: 'val', text: value ?? '' })
      first = false
    }
  }

  return parts
})
</script>

<template>
  <div class="split">
    <section class="pane-controls">
      <slot />
    </section>

    <aside class="pane-console">
      <div class="console-tab">live state</div>

      <slot name="panel" />

      <div class="panel-label">url</div>
      <div class="url-preview">
        <span class="u-path">{{ route.path }}</span>
        <template v-for="(part, index) in urlParts" :key="index">
          <span :class="`u-${part.kind}`">{{ part.text }}</span>
        </template>
        <span v-if="urlParts.length === 0" class="u-empty"> (no params)</span>
      </div>
    </aside>
  </div>
</template>
