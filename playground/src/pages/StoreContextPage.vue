<script setup lang="ts">
import type { ParsedQuery } from 'vuqs'
import { createQueryStore } from '@vuqs/store'
import { codecs, defineQueryState } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

type Tab = 'products' | 'orders'

const route = useRoute()
const router = useRouter()
const adapter = createVueRouterAdapter()

// The active context is external and opaque — the store never derives it.
const tab = ref<Tab>('products')

const store = createQueryStore({
  schema: {
    q: defineQueryState('q', codecs.string),
    category: defineQueryState('category', codecs.literal(['cpu', 'gpu', 'ram'] as const)),
    status: defineQueryState('status', codecs.literal(['open', 'shipped', 'cancelled'] as const)),
    sort: defineQueryState('sort', codecs.literal(['newest', 'oldest'] as const)),
  },
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
  context: {
    active: tab,
    // `q` survives a context switch; everything not preserved resets.
    preserve: ['q'],
    // Field validity per context: invalid fields never enter selected/URL/effective,
    // and are dropped from the URL when you switch away (or paste a stale link).
    only: {
      category: ['products'],
      status: ['orders'],
    },
  },
})

function switchTab(next: Tab) {
  if (next === tab.value) {
    return
  }

  // The store builds the final query (keep preserved + valid, drop the rest, keep
  // unmanaged params); the consumer performs the navigation.
  const query = store.buildContextQuery(route.query as ParsedQuery, next)

  tab.value = next
  router.replace({ query: query as Record<string, string> })
}

function setField(key: 'q' | 'category' | 'status' | 'sort', event: Event) {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  store.setValue(key, (value || undefined) as never)
}
</script>

<template>
  <PageLayout>
    <div class="page-head">
      <h2>Store: context switching</h2>
      <p>
        Two tabs share one store. <code>q</code> is preserved across switches; <code>sort</code>
        resets; <code>category</code> exists only in Products and <code>status</code> only in
        Orders. Set some filters, then switch tabs and watch the URL — it is a single navigation.
      </p>
    </div>

    <div class="ctx-switch">
      <button type="button" :class="{ active: tab === 'products' }" @click="switchTab('products')">Products</button>
      <button type="button" :class="{ active: tab === 'orders' }" @click="switchTab('orders')">Orders</button>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input type="text" placeholder="search (survives switch)…" :value="store.selected.value.q ?? ''" @input="setField('q', $event)">
      </div>
      <span class="type">preserved</span>
    </div>

    <div class="row">
      <span class="k">sort</span>
      <div class="control">
        <select :value="store.selected.value.sort ?? ''" @change="setField('sort', $event)">
          <option value="">—</option>
          <option value="newest">newest</option>
          <option value="oldest">oldest</option>
        </select>
      </div>
      <span class="type">resets</span>
    </div>

    <div v-if="tab === 'products'" class="row">
      <span class="k">category</span>
      <div class="control">
        <select :value="store.selected.value.category ?? ''" @change="setField('category', $event)">
          <option value="">—</option>
          <option value="cpu">cpu</option>
          <option value="gpu">gpu</option>
          <option value="ram">ram</option>
        </select>
      </div>
      <span class="type">products</span>
    </div>

    <div v-else class="row">
      <span class="k">status</span>
      <div class="control">
        <select :value="store.selected.value.status ?? ''" @change="setField('status', $event)">
          <option value="">—</option>
          <option value="open">open</option>
          <option value="shipped">shipped</option>
          <option value="cancelled">cancelled</option>
        </select>
      </div>
      <span class="type">orders</span>
    </div>

    <template #panel>
      <div class="panel-label accent">active context</div>
      <div class="url-preview" style="margin-bottom: 4px;">{{ store.activeContext.value }}</div>
      <StateBlock label="selected" :value="store.selected.value" />
      <StateBlock label="effective" :value="store.effective.value" />
    </template>
  </PageLayout>
</template>
