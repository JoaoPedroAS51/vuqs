<script setup lang="ts">
import { codecs, queryParam, useQueryStates } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'
import { onMounted, ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

const q = useQueryStates({
  q: queryParam('q', codecs.string),
  status: queryParam('status', codecs.literal(['active', 'archived'] as const)),
  perPage: queryParam('perPage', codecs.integer),
}).use(withRuntimeDefaults())

const loading = ref(false)

// Delay the defaults to demonstrate that they can arrive after setup.
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
        <code>withRuntimeDefaults</code> layers runtime <code>defaults</code> (supplied at
        runtime, never serialized) under the bound <code>values</code> read model, and
        exposes <code>explicitValues</code> (explicit param values). Clearing a value reverts it to its default.
      </p>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input
          type="text"
          placeholder="search…"
          :value="q.explicitValues.q ?? ''"
          @input="q.values.q = ($event.target as HTMLInputElement).value || undefined"
        >
        <button class="clear-btn" type="button" @click="q.values.q = undefined">
          clear
        </button>
      </div>
      <span class="type">string</span>
    </div>

    <div class="row">
      <span class="k">status</span>
      <div class="control">
        <select :value="q.explicitValues.status ?? ''" @change="setStatus">
          <option value="">
            — (default)
          </option>
          <option value="active">
            active
          </option>
          <option value="archived">
            archived
          </option>
        </select>
        <button class="clear-btn" type="button" @click="q.values.status = undefined">
          clear
        </button>
      </div>
      <span class="type">literal</span>
    </div>

    <div class="row">
      <span class="k">perPage</span>
      <div class="control">
        <select :value="q.explicitValues.perPage ?? ''" @change="setPerPage">
          <option value="">
            — (default)
          </option>
          <option value="10">
            10
          </option>
          <option value="20">
            20
          </option>
          <option value="50">
            50
          </option>
        </select>
        <button class="clear-btn" type="button" @click="q.values.perPage = undefined">
          clear
        </button>
      </div>
      <span class="type">integer</span>
    </div>

    <div class="row">
      <span class="k">actions</span>
      <div class="control">
        <div class="actions">
          <button class="primary" type="button" @click="q.clear()">
            clear values
          </button>
          <button type="button" :disabled="loading" @click="loadDefaults()">
            {{ loading ? 'loading…' : 'reload defaults' }}
          </button>
          <button type="button" @click="q.clearDefaults()">
            clear defaults
          </button>
        </div>
      </div>
      <span class="type" />
    </div>

    <template #panel>
      <StateBlock label="explicitValues" :value="q.explicitValues" accent />
      <StateBlock label="defaults · runtime" :value="q.defaults" />
      <StateBlock label="values · read" :value="q.values" />
    </template>
  </PageLayout>
</template>
