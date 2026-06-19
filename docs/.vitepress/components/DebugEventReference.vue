<script setup lang="ts">
import type { DebugSummaryPolicy } from '../../../packages/core/src/debug/event-catalog'
import { DEBUG_EVENT_ENTRIES } from '../../../packages/core/src/debug/event-catalog'
import { DEBUG_EVENT_EXAMPLES } from '../debug-event-examples'

interface EventGroup {
  scope: string
  entries: typeof DEBUG_EVENT_ENTRIES
}

const summaryLabels = {
  'aggregate': 'Aggregated',
  'visible': 'Visible',
  'conditional': 'Conditional',
  'trace-only': 'Trace only',
  'passthrough': 'Pass-through',
} satisfies Record<DebugSummaryPolicy, string>

const summaryDescriptions = {
  'aggregate': 'Does not print its own line. It contributes to a later logical result.',
  'visible': 'Prints its own line in the default summary.',
  'conditional': 'Prints only for the outcomes described below.',
  'trace-only': 'Does not appear in the default summary.',
  'passthrough': 'Prints the message supplied by the module author.',
} satisfies Record<DebugSummaryPolicy, string>

const groups = DEBUG_EVENT_ENTRIES.reduce<EventGroup[]>((result, entry) => {
  const scope = entry[0].split(':', 1)[0]!
  const current = result.at(-1)

  if (current?.scope === scope) {
    current.entries.push(entry)
  }
  else {
    result.push({ scope, entries: [entry] })
  }

  return result
}, [])

function traceExample([code, event]: typeof DEBUG_EVENT_ENTRIES[number]): string {
  const data = DEBUG_EVENT_EXAMPLES[code]
  return (event.formatTrace as (data: unknown, raw: unknown) => string)(data, data)
}
</script>

<template>
  <div class="event-reference">
    <div class="event-index-wrapper">
      <table class="event-index">
        <thead>
          <tr>
            <th>Event</th>
            <th>Level</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[code, event] in DEBUG_EVENT_ENTRIES" :key="code">
            <td><a :href="`#${code}`"><code>{{ code }}</code></a></td>
            <td><code>{{ event.level }}</code></td>
            <td>{{ summaryLabels[event.summary] }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul class="event-index-list">
      <li v-for="[code, event] in DEBUG_EVENT_ENTRIES" :key="code">
        <a :href="`#${code}`"><code>{{ code }}</code></a>
        <span><code>{{ event.level }}</code> · {{ summaryLabels[event.summary] }}</span>
      </li>
    </ul>

    <section v-for="group in groups" :key="group.scope" class="event-group">
      <h2 :id="`${group.scope}-events`" tabindex="-1">
        <code>{{ group.scope }}</code> events
      </h2>

      <article v-for="[code, event] in group.entries" :id="code" :key="code" class="event-card">
        <h3 tabindex="-1">
          <a class="header-anchor" :href="`#${code}`" :aria-label="`Permalink to ${code}`">&ZeroWidthSpace;</a>
          <code>{{ code }}</code>
        </h3>

        <dl class="event-metadata">
          <div>
            <dt>Level</dt>
            <dd><code>{{ event.level }}</code></dd>
          </div>
          <div>
            <dt>Summary</dt>
            <dd>{{ summaryLabels[event.summary] }}</dd>
          </div>
          <div>
            <dt>Emitted when</dt>
            <dd>{{ event.emittedWhen }}</dd>
          </div>
          <div>
            <dt>Payload</dt>
            <dd>
              <template v-if="event.payload.length">
                <code v-for="field in event.payload" :key="field" class="payload-field">{{ field }}</code>
              </template>
              <span v-else>None</span>
            </dd>
          </div>
        </dl>

        <p class="summary-behavior">
          <strong>Summary behavior:</strong>
          {{ summaryDescriptions[event.summary] }}
          {{ event.summaryNote }}
        </p>

        <template v-if="event.summaryExample">
          <p class="summary-label">
            <strong>Summary example</strong>
          </p>
          <pre class="summary-example"><code>{{ event.summaryExample }}</code></pre>
        </template>

        <p class="trace-label">
          <strong>Trace example</strong>
        </p>
        <pre class="trace-example"><code>[vuqs trace] {{ code }} — {{ traceExample([code, event]) }}</code></pre>
      </article>
    </section>
  </div>
</template>

<style scoped>
.event-reference {
  margin-top: 24px;
}

.event-index-wrapper {
  overflow-x: auto;
  margin: 16px 0 32px;
}

.event-index {
  display: table;
  width: 100%;
  min-width: 460px;
  margin: 0;
}

.event-index-list {
  display: none;
  padding: 0;
  margin: 16px 0 32px;
  list-style: none;
}

.event-index td,
.event-index th {
  white-space: nowrap;
}

.event-group {
  margin-top: 40px;
}

.event-card {
  padding: 20px 0 24px;
  border-bottom: 1px solid var(--vp-c-divider);
  scroll-margin-top: 88px;
}

.event-card h3 {
  margin-top: 0;
}

.event-metadata {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 16px 0;
}

.event-metadata div {
  min-width: 0;
}

.event-metadata dt {
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 600;
}

.event-metadata dd {
  margin: 4px 0 0;
}

.payload-field:not(:last-child) {
  margin-right: 6px;
}

.summary-behavior {
  margin: 16px 0;
}

.summary-label,
.trace-label {
  margin: 16px 0 8px;
}

.summary-example,
.trace-example {
  margin: 0;
  overflow-x: auto;
}

@media (max-width: 640px) {
  .event-index-wrapper {
    display: none;
  }

  .event-index-list {
    display: grid;
    gap: 0;
  }

  .event-index-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--vp-c-divider);
  }

  .event-index-list span {
    flex: none;
    color: var(--vp-c-text-2);
    font-size: 13px;
  }

  .event-metadata {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
