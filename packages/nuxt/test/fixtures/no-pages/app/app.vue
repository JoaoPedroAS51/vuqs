<script setup lang="ts">
const search = useQueryState('q', codecs.string.withDefault('none'))
const tags = useQueryState('tags', codecs.arrayOf(codecs.string).withDefault([]))
const adapter = useQueryAdapter()
const replaceSearch = () => search.set('replaced')
const pushSearch = () => search.set('pushed', { history: 'push' })
const clearSearch = () => search.clear()
const writeTags = () => tags.set(['red', 'blue'])

// Scroll
const page = useQueryState('page', codecs.integer.withDefault(1))
const rows = useQueryState('rows', codecs.integer.withDefault(0))

function nextPage(scroll?: boolean | ScrollToOptions) {
  page.set(page.value + 1, scroll === undefined ? undefined : { scroll })
}

function coalesce() {
  page.set(page.value + 1, { scroll: false })
  page.set(page.value + 1, { scroll: true })
}

function growAndScroll() {
  rows.set(rows.value + 2, { scroll: { top: 2500 } })
}
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
    <nav class="toolbar">
      <button id="scroll-true" @click="nextPage(true)">
        Scroll to top
      </button>
      <button id="scroll-object" @click="nextPage({ top: 400, behavior: 'smooth' })">
        Scroll to 400 smoothly
      </button>
      <button id="scroll-vertical" @click="nextPage({ top: 0 })">
        Scroll vertically to 0
      </button>
      <button id="scroll-false" @click="nextPage(false)">
        Keep position
      </button>
      <button id="scroll-unset" @click="nextPage()">
        No scroll option
      </button>
      <button id="scroll-coalesce" @click="coalesce">
        Coalesce false and true
      </button>
      <button id="scroll-grow" @click="growAndScroll">
        Grow and scroll
      </button>
    </nav>
    <p id="page">
      {{ page }}
    </p>
    <div class="content" />
    <div v-for="row in rows" :key="row" class="row" />
  </main>
</template>

<style>
.toolbar {
  position: fixed;
  top: 0;
  right: 0;
}

.content {
  width: 3000px;
  height: 2000px;
}

.row {
  height: 1000px;
}
</style>
