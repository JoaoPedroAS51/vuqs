<script setup lang="ts">
import { codecs, useQueryState } from 'vuqs'
import { computed } from 'vue'
import PageLayout from '../components/PageLayout.vue'
import StateBlock from '../components/StateBlock.vue'

// One key each, one codec each. `query` + `navigate` come from the adapter
// provided in App.vue, so they are omitted here.
const search = useQueryState('q', codecs.string.withDefault(''))
const count = useQueryState('count', codecs.integer.withDefault(0))
const ratio = useQueryState('ratio', codecs.float)
const enabled = useQueryState('enabled', codecs.boolean.withDefault(false))
const color = useQueryState('color', codecs.literal(['red', 'green', 'blue'] as const))
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
const date = useQueryState('date', codecs.isoDate)

// The date codec speaks `Date`; arrayOf speaks `string[]`. Adapt both to plain
// native inputs (a date field and a comma-separated text field).
const dateInput = computed({
  get: () => (date.value ? date.value.toISOString().slice(0, 10) : ''),
  set: (value: string) => (value ? date.set(new Date(value)) : date.clear()),
})

const tagsInput = computed({
  get: () => tags.value.join(', '),
  set: (value: string) => {
    const parsed = value.split(',').map(item => item.trim()).filter(Boolean)
    tags.value = parsed
  },
})

// In templates Vue auto-unwraps a top-level ref, so the augmented `.clear()` is
// reachable only here in the script — expose it via a plain object.
const clear = {
  q: () => search.clear(),
  count: () => count.clear(),
  ratio: () => ratio.clear(),
  enabled: () => enabled.clear(),
  color: () => color.clear(),
  tags: () => tags.clear(),
  date: () => date.clear(),
}

const value = computed(() => ({
  q: search.value,
  count: count.value,
  ratio: ratio.value,
  enabled: enabled.value,
  color: color.value,
  tags: tags.value,
  date: date.value,
}))
</script>

<template>
  <PageLayout>
    <div class="page-head">
      <h2>Single state + codecs</h2>
      <p>
        <code>useQueryState(path, codec)</code> binds one query key to a writable ref.
        <code>.withDefault()</code> makes the ref non-nullable and drops the value from the URL when
        it equals the default. <code>clear</code> reverts a field to its default.
      </p>
    </div>

    <div class="row">
      <span class="k">q</span>
      <div class="control">
        <input v-model="search" type="text" placeholder="search…">
        <button class="clear-btn" type="button" @click="clear.q()">clear</button>
      </div>
      <span class="type">string</span>
    </div>

    <div class="row">
      <span class="k">count</span>
      <div class="control">
        <input v-model.number="count" type="number">
        <button class="clear-btn" type="button" @click="clear.count()">clear</button>
      </div>
      <span class="type">integer</span>
    </div>

    <div class="row">
      <span class="k">ratio</span>
      <div class="control">
        <input v-model.number="ratio" type="number" step="0.1" placeholder="e.g. 1.5">
        <button class="clear-btn" type="button" @click="clear.ratio()">clear</button>
      </div>
      <span class="type">float</span>
    </div>

    <div class="row">
      <span class="k">enabled</span>
      <div class="control">
        <label class="bool-row"><input v-model="enabled" type="checkbox"> {{ enabled }}</label>
        <button class="clear-btn" type="button" @click="clear.enabled()">clear</button>
      </div>
      <span class="type">boolean</span>
    </div>

    <div class="row">
      <span class="k">color</span>
      <div class="control">
        <select v-model="color">
          <option :value="undefined">—</option>
          <option value="red">red</option>
          <option value="green">green</option>
          <option value="blue">blue</option>
        </select>
        <button class="clear-btn" type="button" @click="clear.color()">clear</button>
      </div>
      <span class="type">literal</span>
    </div>

    <div class="row">
      <span class="k">tags</span>
      <div class="control">
        <input v-model="tagsInput" type="text" placeholder="comma, separated">
        <button class="clear-btn" type="button" @click="clear.tags()">clear</button>
      </div>
      <span class="type">arrayOf</span>
    </div>

    <div class="row">
      <span class="k">date</span>
      <div class="control">
        <input v-model="dateInput" type="date">
        <button class="clear-btn" type="button" @click="clear.date()">clear</button>
      </div>
      <span class="type">isoDate</span>
    </div>

    <template #panel>
      <StateBlock label="value" :value="value" accent />
    </template>
  </PageLayout>
</template>
