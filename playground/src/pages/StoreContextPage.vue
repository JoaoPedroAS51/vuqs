<script setup lang="ts">
import { codecs, queryParam, useQueryStates } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { withContext, withRuntimeDefaults } from '@vuqs/core/modules'
import { ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

type Tab = 'products' | 'orders'

// The context callback needs navigation without replacing the app-provided query source.
const adapter = createVueRouterAdapter()

const tab = ref<Tab>('products')

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu', 'ram'] as const)),
  status: queryParam('status', codecs.literal(['open', 'shipped', 'cancelled'] as const)),
  sort: queryParam('sort', codecs.literal(['newest', 'oldest'] as const)),
}

const q = useQueryStates(schema)
  .use(withRuntimeDefaults())
  .use(withContext({
    active: tab,
    preserve: ['q'],
    only: { category: ['products'], status: ['orders'] },
    navigate: (next, query, options) => {
      tab.value = next
      adapter.navigate(query, { history: 'replace', ...options })
    },
  }))

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
        exists only in Products and <code>status</code> only in Orders. Switching tabs reconciles the
        URL in one navigation.
      </p>
    </div>

    <div class="ctx-switch">
      <button type="button" :class="{ active: tab === 'products' }" @click="switchTab('products')">
        Products
      </button>
      <button type="button" :class="{ active: tab === 'orders' }" @click="switchTab('orders')">
        Orders
      </button>
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
          <option value="">
            —
          </option>
          <option value="newest">
            newest
          </option>
          <option value="oldest">
            oldest
          </option>
        </select>
      </div>
      <span class="type">resets</span>
    </div>

    <div v-if="tab === 'products'" class="row">
      <span class="k">category</span>
      <div class="control">
        <select :value="q.selected.category ?? ''" @change="setField('category', $event)">
          <option value="">
            —
          </option>
          <option value="cpu">
            cpu
          </option>
          <option value="gpu">
            gpu
          </option>
          <option value="ram">
            ram
          </option>
        </select>
      </div>
      <span class="type">products</span>
    </div>

    <div v-else class="row">
      <span class="k">status</span>
      <div class="control">
        <select :value="q.selected.status ?? ''" @change="setField('status', $event)">
          <option value="">
            —
          </option>
          <option value="open">
            open
          </option>
          <option value="shipped">
            shipped
          </option>
          <option value="cancelled">
            cancelled
          </option>
        </select>
      </div>
      <span class="type">orders</span>
    </div>

    <template #panel>
      <div class="panel-label accent">
        active context
      </div>
      <div class="url-preview" style="margin-bottom: 4px;">
        {{ q.activeContext.value }}
      </div>
      <StateBlock label="selected" :value="q.selected" />
      <StateBlock label="values" :value="q.values" />
    </template>
  </PageLayout>
</template>
