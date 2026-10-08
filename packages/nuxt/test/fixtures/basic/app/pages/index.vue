<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault('none'))
const page = useQueryState('page', codecs.integer.withDefault(1))
const schema = defineQuerySchema({ sort: codecs.literal(['name', 'price']).withDefault('name') })
const filters = useQueryStates(schema).use(withActiveParams())
const { sort } = toQueryRefs(filters)
const filterModel = toQueryRef(filters)
</script>

<template>
  <main>
    <p id="search">
      {{ search }}
    </p>
    <p id="page">
      {{ page }}
    </p>
    <p id="sort">
      {{ sort }}
    </p>
    <p id="model-sort">
      {{ filterModel.sort }}
    </p>
    <p id="active">
      {{ filters.hasActive.value }}
    </p>
  </main>
</template>
