<script setup lang="ts">
import { createQueryStore } from '@vuqs/store'
import { codecs, defineQueryState } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { onMounted, ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

// The store needs a query source + navigate. Reuse the vue-router adapter for both.
const adapter = createVueRouterAdapter()

// Schema uses PLAIN codecs (no .withDefault): the store supplies defaults via
// setDefaults, so effective = { ...defaults, ...selected }.
const store = createQueryStore({
  schema: {
    q: defineQueryState('q', codecs.string),
    status: defineQueryState('status', codecs.literal(['active', 'archived'] as const)),
    perPage: defineQueryState('perPage', codecs.integer),
  },
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
})

const loading = ref(false)

// Pretend an API hands us the user's saved defaults. These feed `effective` and
// the UI, but are NEVER written to the URL — only explicit selections are.
function loadDefaults() {
  loading.value = true
  window.setTimeout(() => {
    store.setDefaults({ q: '', status: 'active', perPage: 20 })
    loading.value = false
  }, 700)
}

onMounted(loadDefaults)

function setStatus(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  store.setValue('status', (value || undefined) as 'active' | 'archived' | undefined)
}

function setPerPage(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  store.setValue('perPage', value ? Number(value) : undefined)
}
</script>

<template>
  <PageLayout>
    <div class="page-head">
      <h2>Store: the three states</h2>
      <p>
        <code>@vuqs/store</code> separates <code>selected</code> (mirrors the URL),
        <code>defaults</code> (loaded from an API, never serialized), and the derived
        <code>effective</code> read model. Clearing a value reverts it to its default.
      </p>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input
          type="text"
          placeholder="search…"
          :value="store.selected.q ?? ''"
          @input="store.setValue('q', ($event.target as HTMLInputElement).value || undefined)"
        >
        <button class="clear-btn" type="button" @click="store.setValue('q', undefined)">clear</button>
      </div>
      <span class="type">string</span>
    </div>

    <div class="row">
      <span class="k">status</span>
      <div class="control">
        <select :value="store.selected.status ?? ''" @change="setStatus">
          <option value="">— (default)</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
        <button class="clear-btn" type="button" @click="store.setValue('status', undefined)">clear</button>
      </div>
      <span class="type">literal</span>
    </div>

    <div class="row">
      <span class="k">perPage</span>
      <div class="control">
        <select :value="store.selected.perPage ?? ''" @change="setPerPage">
          <option value="">— (default)</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
        <button class="clear-btn" type="button" @click="store.setValue('perPage', undefined)">clear</button>
      </div>
      <span class="type">integer</span>
    </div>

    <div class="row">
      <span class="k">actions</span>
      <div class="control">
        <div class="actions">
          <button class="primary" type="button" @click="store.clear()">clear selections</button>
          <button type="button" :disabled="loading" @click="loadDefaults()">{{ loading ? 'loading…' : 'reload defaults' }}</button>
          <button type="button" @click="store.clearDefaults()">clear defaults</button>
        </div>
      </div>
      <span class="type" />
    </div>

    <template #panel>
      <StateBlock label="selected → URL" :value="store.selected" accent />
      <StateBlock label="defaults · API" :value="store.defaults" />
      <StateBlock label="effective · read" :value="store.effective" />
    </template>
  </PageLayout>
</template>
