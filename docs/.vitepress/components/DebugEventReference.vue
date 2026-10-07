<script setup lang="ts">
import type { DebugEventCode, DebugScope } from '../../../packages/core/src/core/diagnostics/events'
import { computed, shallowRef } from 'vue'
import { data } from '../debug-events.data'

const props = defineProps<{ scopes: readonly DebugScope[] }>()
const events = computed(() => props.scopes.flatMap(scope => data.filter(event => event.code.startsWith(`${scope}:`))))
const expanded = shallowRef(new Set<DebugEventCode>())

function togglePayload(code: DebugEventCode): void {
  const next = new Set(expanded.value)
  if (next.has(code)) {
    next.delete(code)
  }
  else {
    next.add(code)
  }
  expanded.value = next
}
</script>

<template>
  <div class="event-table-wrapper">
    <table class="event-table">
      <thead>
        <tr>
          <th scope="col">
            Event
          </th>
          <th scope="col">
            Payload
          </th>
          <th scope="col">
            Emitted when
          </th>
          <th scope="col">
            Level
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="event in events" :key="event.code">
          <tr :id="event.code" class="event-row">
            <td class="event-code">
              <a :href="`#${event.code}`"><code>{{ event.code }}</code></a>
            </td>
            <td class="event-payload">
              <button
                v-if="event.fields.length"
                class="payload-toggle"
                :aria-label="`Payload for ${event.code}`"
                :aria-expanded="expanded.has(event.code)"
                :aria-controls="`payload-${event.code}`"
                @click="togglePayload(event.code)"
              >
                <span aria-hidden="true">{{ expanded.has(event.code) ? '▾' : '▸' }}</span>
                <span>
                  <code v-for="field in event.fields" :key="field.name" class="payload-name">{{ field.name }}{{ field.optional ? '?' : '' }}</code>
                </span>
              </button>
              <span v-else>None</span>
            </td>
            <td class="event-condition">
              {{ event.emittedWhen }}
            </td>
            <td><code>{{ event.level }}</code></td>
          </tr>
          <tr v-if="event.fields.length" v-show="expanded.has(event.code)" :id="`payload-${event.code}`" class="payload-row">
            <td colspan="4">
              <p class="payload-type">
                <code>DebugEventMap['{{ event.code }}']</code>
              </p>
              <table class="payload-fields">
                <thead>
                  <tr>
                    <th scope="col">
                      Property
                    </th>
                    <th scope="col" class="field-type-cell">
                      Type
                    </th>
                    <th scope="col">
                      Meaning
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="field in event.fields" :key="field.name">
                    <td><code>{{ field.name }}{{ field.optional ? '?' : '' }}</code></td>
                    <td class="field-type-cell">
                      <code class="field-type">{{ field.type }}</code>
                    </td>
                    <td>{{ field.description }}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.event-table-wrapper {
  overflow-x: auto;
  margin: 16px 0 32px;
}

.event-table {
  display: table;
  width: 100%;
  min-width: 560px;
  margin: 0;
}

.event-row {
  scroll-margin-top: 88px;
}

.event-code,
.event-payload,
.event-condition {
  vertical-align: top;
}

.event-code {
  white-space: nowrap;
}

.event-payload {
  min-width: 145px;
}

.event-condition {
  min-width: 170px;
}

.payload-toggle {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.payload-toggle:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

.payload-name {
  display: inline-block;
  margin: 0 4px 4px 0;
}

.payload-type {
  margin: 12px 0;
}

.payload-fields {
  display: table;
  width: 100%;
  margin: 0;
}

.field-type-cell {
  min-width: 160px;
}

.field-type {
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
