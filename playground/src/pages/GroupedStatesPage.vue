<script setup lang="ts">
import { codecs, defineQueryState, useQueryStates } from 'vuqs'
import { computed, ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

interface Product {
  name: string
  price: number
}

const PRODUCTS: Product[] = [
  { name: 'Aero Keyboard', price: 89 },
  { name: 'Basalt Mouse', price: 39 },
  { name: 'Cobalt Monitor', price: 249 },
  { name: 'Delta Webcam', price: 59 },
  { name: 'Ember Desk Lamp', price: 45 },
  { name: 'Flux Headset', price: 129 },
  { name: 'Graphite Stand', price: 35 },
  { name: 'Halo Microphone', price: 99 },
]

const PAGE_SIZE = 3

// One call binds the whole filter group. Each field is a writable ref; assigning
// several in a row coalesces into a single navigation (one microtask).
const { q, sort, page } = useQueryStates({
  q: defineQueryState('q', codecs.string.withDefault('')),
  sort: defineQueryState('sort', codecs.literal(['asc', 'desc'] as const).withDefault('asc')),
  page: defineQueryState('page', codecs.index.withDefault(0)),
})

const historyMode = ref<'replace' | 'push'>('replace')

// `useQueryStates` types every field as `T | undefined` even with `.withDefault()`
// (only the single `useQueryState` overload narrows that away), so guard reads.
const filtered = computed(() => {
  const term = (q.value ?? '').trim().toLowerCase()
  const matched = PRODUCTS.filter(p => p.name.toLowerCase().includes(term))

  return matched.sort((a, b) => (sort.value === 'asc' ? a.price - b.price : b.price - a.price))
})

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value ?? 0, pageCount.value - 1))
const pageItems = computed(() =>
  filtered.value.slice(currentPage.value * PAGE_SIZE, currentPage.value * PAGE_SIZE + PAGE_SIZE),
)
const term = computed(() => q.value ?? '')

// 1-based in the input, 0-based index codec under the hood. The per-call `history`
// override honors the selected mode; the search box keeps the adapter default.
const pageInput = computed({
  get: () => currentPage.value + 1,
  set: (next: number) => {
    const clamped = Math.max(0, Math.min((next || 1) - 1, pageCount.value - 1))
    page.set(clamped, { history: historyMode.value })
  },
})

function resetPage() {
  page.value = 0
}

const value = computed(() => ({ q: q.value, sort: sort.value, page: currentPage.value }))
</script>

<template>
  <PageLayout>
    <div class="page-head">
      <h2>Grouped states</h2>
      <p>
        <code>useQueryStates</code> binds a whole filter group at once. Search, sort, and page all
        live in the URL and drive the list below. The page field uses a per-call <code>history</code>
        override; search stays on <code>replace</code>.
      </p>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input v-model="q" type="text" placeholder="filter products…" @input="resetPage">
      </div>
      <span class="type">string</span>
    </div>

    <div class="row">
      <span class="k">sort</span>
      <div class="control">
        <select v-model="sort">
          <option value="asc">price ascending</option>
          <option value="desc">price descending</option>
        </select>
      </div>
      <span class="type">literal</span>
    </div>

    <div class="row">
      <span class="k">page</span>
      <div class="control">
        <input v-model.number="pageInput" type="number" min="1" :max="pageCount">
        <span class="chip">of {{ pageCount }}</span>
      </div>
      <span class="type">index</span>
    </div>

    <div class="row">
      <span class="k">history</span>
      <div class="control">
        <div class="radio-row">
          <label><input v-model="historyMode" type="radio" value="replace"> replace</label>
          <label><input v-model="historyMode" type="radio" value="push"> push</label>
        </div>
      </div>
      <span class="type">per-call</span>
    </div>

    <div class="subhead">Results · {{ filtered.length }} match{{ filtered.length === 1 ? '' : 'es' }}</div>
    <ul v-if="pageItems.length" class="results">
      <li v-for="item in pageItems" :key="item.name">
        <span>{{ item.name }}</span>
        <span class="meta">${{ item.price }}</span>
      </li>
    </ul>
    <p v-else class="empty">No products match “{{ term }}”.</p>

    <template #panel>
      <StateBlock label="values" :value="value" accent />
    </template>
  </PageLayout>
</template>
