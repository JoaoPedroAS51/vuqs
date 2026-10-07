<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault('none'))
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
const adapter = useQueryAdapter()
const replaceSearch = () => search.set('replaced')
const pushSearch = () => search.set('pushed', { history: 'push' })
const clearSearch = () => search.clear()
const writeTags = () => tags.set(['red', 'blue'])
</script>

<template>
  <main>
    <p id="adapter">
      {{ adapter?.debugName }}
    </p>
    <p id="search">
      {{ search }}
    </p>
    <p id="tags">
      {{ tags.join(',') }}
    </p>
    <button id="replace" @click="replaceSearch">
      Replace
    </button>
    <button id="push" @click="pushSearch">
      Push
    </button>
    <button id="clear" @click="clearSearch">
      Clear
    </button>
    <button id="tags-write" @click="writeTags">
      Tags
    </button>
  </main>
</template>
