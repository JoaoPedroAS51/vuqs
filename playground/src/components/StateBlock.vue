<script setup lang="ts">
import { computed } from 'vue'
import { highlightJson } from '../highlight'

const props = defineProps<{ label: string, value: unknown, accent?: boolean }>()

const html = computed(() => highlightJson(props.value))
</script>

<template>
  <div class="state-block">
    <div class="panel-label" :class="{ accent }">
      {{ label }}
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -- highlightJson escapes its input -->
    <pre class="json" v-html="html" />
  </div>
</template>
