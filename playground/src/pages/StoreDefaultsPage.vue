<script setup lang="ts">
import { codecs, defineQueryState, useQueryStates } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { withEffective } from 'vuqs/modules'
import { onMounted, ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

// Reuse the vue-router adapter as the query source + navigate.
const adapter = createVueRouterAdapter()

// `withEffective` separates the three states: selected (the URL), defaults
// (supplied at runtime via setDefaults, over codec defaults), and the derived
// effective. Defaults feed the UI but are never serialized.
const q = useQueryStates({
  q: defineQueryState('q', codecs.string),
  status: defineQueryState('status', codecs.literal(['active', 'archived'] as const)),
  perPage: defineQueryState('perPage', codecs.integer),
}, {
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
}).use(withEffective())

const loading = ref(false)

// Pretend saved preferences are loaded at runtime. These feed `effective` and
// the UI, but are NEVER written to the URL — only explicit selections are.
function loadDefaults() {
  loading.value = true
  window.setTimeout(() => {
    q.setDefaults({ q: '', status: 'active', perPage: 20 })
    loading.value = false
  }, 700)
}

onMounted(loadDefaults)

function setStatus(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  q.values.status = (value || undefined) as 'active' | 'archived' | undefined
}

function setPerPage(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  q.values.perPage = value ? Number(value) : undefined
}
</script>

<template>
  <PageLayout>
    <div class="page-head">
      <h2>The three states</h2>
      <p>
        <code>withEffective</code> separates <code>selected</code> (mirrors the URL),
        <code>defaults</code> (supplied at runtime, never serialized), and the derived
        <code>effective</code> read model. Clearing a value reverts it to its default.
      </p>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input
          type="text"
          placeholder="search…"
          :value="q.selected.q ?? ''"
          @input="q.values.q = ($event.target as HTMLInputElement).value || undefined"
        >
        <button class="clear-btn" type="button" @click="q.values.q = undefined">clear</button>
      </div>
      <span class="type">string</span>
    </div>

    <div class="row">
      <span class="k">status</span>
      <div class="control">
        <select :value="q.selected.status ?? ''" @change="setStatus">
          <option value="">— (default)</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
        <button class="clear-btn" type="button" @click="q.values.status = undefined">clear</button>
      </div>
      <span class="type">literal</span>
    </div>

    <div class="row">
      <span class="k">perPage</span>
      <div class="control">
        <select :value="q.selected.perPage ?? ''" @change="setPerPage">
          <option value="">— (default)</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
        <button class="clear-btn" type="button" @click="q.values.perPage = undefined">clear</button>
      </div>
      <span class="type">integer</span>
    </div>

    <div class="row">
      <span class="k">actions</span>
      <div class="control">
        <div class="actions">
          <button class="primary" type="button" @click="q.clear()">clear selections</button>
          <button type="button" :disabled="loading" @click="loadDefaults()">{{ loading ? 'loading…' : 'reload defaults' }}</button>
          <button type="button" @click="q.clearDefaults()">clear defaults</button>
        </div>
      </div>
      <span class="type" />
    </div>

    <template #panel>
      <StateBlock label="selected → URL" :value="q.selected" accent />
      <StateBlock label="defaults · runtime" :value="q.defaults" />
      <StateBlock label="effective · read" :value="q.effective" />
    </template>
  </PageLayout>
</template>
