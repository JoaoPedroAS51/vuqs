<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault('none'))
const page = useQueryState('page', codecs.integer.withDefault(1))
const filters = useQueryStates({ sort: codecs.literal(['name', 'price']).withDefault('name') }).use(withActiveParams())
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
      {{ filters.values.sort }}
    </p>
    <p id="active">
      {{ filters.hasActive.value }}
    </p>
  </main>
</template>
