<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'

const { values, patch, clear } = useQueryStates({
  page: codecs.integer.withDefault(1),
  tags: codecs.arrayOf(codecs.string).withDefault([]),
})

defineExpose({ patch, clear })
</script>

<template>
  <section aria-label="Filters">
    <label>
      Page
      <input v-model.number="values.page" type="number">
    </label>
    <label>
      <input v-model="values.tags" type="checkbox" value="red">
      Red
    </label>
    <label>
      <input v-model="values.tags" type="checkbox" value="blue">
      Blue
    </label>
    <output data-testid="filters">{{ JSON.stringify(values) }}</output>
  </section>
</template>
