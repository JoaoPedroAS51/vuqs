<script setup lang="ts">
import { codecs, defineQueryState, useQueryStates } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { withContext, withEffective } from 'vuqs/modules'
import { ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

type Tab = 'products' | 'orders'

// A local adapter just for the context `navigate` below (writing the reconciled
// query). The query source for `useQueryStates` itself comes from the app-root
// adapter (see App.vue).
const adapter = createVueRouterAdapter()

// The active context is external and opaque — the module never derives it.
const tab = ref<Tab>('products')

const schema = {
  q: defineQueryState('q', codecs.string),
  category: defineQueryState('category', codecs.literal(['cpu', 'gpu', 'ram'] as const)),
  status: defineQueryState('status', codecs.literal(['open', 'shipped', 'cancelled'] as const)),
  sort: defineQueryState('sort', codecs.literal(['newest', 'oldest'] as const)),
}

const q = useQueryStates(schema)
  .use(withEffective())
  // `q` survives a context switch; everything not preserved resets. Field validity
  // per context: invalid fields never enter selected/URL/effective, and are dropped
  // when you switch away (or paste a stale link).
  .use(withContext({
    active: tab,
    preserve: ['q'],
    only: { category: ['products'], status: ['orders'] },
    // The consumer maps a context to a navigation. Here the tab is local state, so
    // we set it and write the reconciled query in one navigation. With route-backed
    // tabs this would be a single `navigateTo({ path, query })`.
    navigate: (next, query, options) => {
      tab.value = next
      adapter.navigate(query, { history: 'replace', ...options })
    },
  }))

// One navigation: `switchTo` reconciles the query (keep preserved + valid, reset
// the rest) and hands it to the `navigate` option above.
function switchTab(next: Tab) {
  q.switchTo(next)
}

function setField(key: 'q' | 'category' | 'status' | 'sort', event: Event) {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  q.values[key] = (value || undefined) as never
}
</script>

<template>
  <PageLayout>
    <div class="page-head">
      <h2>Context switching</h2>
      <p>
        <code>withContext</code> ties the schema to an active context. Two tabs share one composable:
        <code>q</code> is preserved across switches; <code>sort</code> resets; <code>category</code>
        exists only in Products and <code>status</code> only in Orders. Set some filters, then switch
        tabs and watch the URL — it is a single navigation.
      </p>
    </div>

    <div class="ctx-switch">
      <button type="button" :class="{ active: tab === 'products' }" @click="switchTab('products')">Products</button>
      <button type="button" :class="{ active: tab === 'orders' }" @click="switchTab('orders')">Orders</button>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input type="text" placeholder="search (survives switch)…" :value="q.selected.q ?? ''" @input="setField('q', $event)">
      </div>
      <span class="type">preserved</span>
    </div>

    <div class="row">
      <span class="k">sort</span>
      <div class="control">
        <select :value="q.selected.sort ?? ''" @change="setField('sort', $event)">
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
        <select :value="q.selected.category ?? ''" @change="setField('category', $event)">
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
        <select :value="q.selected.status ?? ''" @change="setField('status', $event)">
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
      <div class="url-preview" style="margin-bottom: 4px;">{{ q.activeContext.value }}</div>
      <StateBlock label="selected" :value="q.selected" />
      <StateBlock label="effective" :value="q.effective" />
    </template>
  </PageLayout>
</template>
