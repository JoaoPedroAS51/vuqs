<script setup lang="ts">
const route = useRoute()
const page = useQueryState('page', codecs.integer.withDefault(1))

function nextPage(scroll?: boolean | ScrollToOptions) {
  page.set(page.value + 1, scroll === undefined ? undefined : { scroll })
}

function navigateToReviews() {
  return navigateTo({ query: route.query, hash: '#reviews' })
}
</script>

<template>
  <main>
    <nav class="toolbar">
      <button id="scroll-true" @click="nextPage(true)">
        Scroll to top
      </button>
      <button id="scroll-object" @click="nextPage({ top: 400 })">
        Scroll to 400
      </button>
      <button id="scroll-false" @click="nextPage(false)">
        Keep position
      </button>
      <button id="scroll-unset" @click="nextPage()">
        No scroll option
      </button>
      <button id="navigate-reviews" @click="navigateToReviews">
        Reviews
      </button>
    </nav>
    <p id="page">
      {{ page }}
    </p>
    <div class="content" />
    <section id="reviews" class="content">
      Reviews
    </section>
  </main>
</template>

<style scoped>
.toolbar {
  position: fixed;
  top: 0;
  left: 0;
}

.content {
  height: 2000px;
}
</style>
