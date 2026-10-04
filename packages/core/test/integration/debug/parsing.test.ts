import type { DebugEvent } from '../../../src/core/diagnostics/bus'
import type { ParsedQuery } from '../../../src/core/query/types'
import type { QueryStateNavigate } from '../../../src/core/runtime/adapter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'
import { createTestingAdapter } from '../../../src/adapters/testing'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { addDebugReporter, getDebugChannel } from '../../../src/core/diagnostics/bus'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { captureEvents, resetDebugState, trackReporter } from '../../helpers/debug'

afterEach(resetDebugState)

describe('parse visibility', () => {
  it('warns once when a present value fails to decode', () => {
    const events = captureEvents()

    const adapter = createTestingAdapter({ searchParams: { n: 'abc' }, hasMemory: true })
    const navigate = vi.fn(adapter.navigate)
    const app = createApp({})
    installQueryAdapter(app, { query: adapter.query, navigate })

    const { values } = app.runWithContext(() => useQueryStates({ n: codecs.integer }))
    // Touch the read model so the parse runs.
    void values.n

    const parseMisses = events.filter(([code]) => code === 'engine:parse-miss')
    expect(parseMisses.length).toBeGreaterThan(0)
    expect(parseMisses[0]).toEqual(['engine:parse-miss', expect.objectContaining({ path: 'n', raw: 'abc' })])
  })

  it('deduplicates an invalid path across unrelated recomputes and resets after validity', () => {
    const events = captureEvents()
    const query = ref<ParsedQuery>({ n: 'bad', color: 'red' })
    const app = createApp({})
    installQueryAdapter(app, { query, navigate: vi.fn<QueryStateNavigate>() })
    const state = app.runWithContext(() => useQueryStates({ n: codecs.integer, color: codecs.string }))

    void state.values.n
    query.value = { n: 'bad', color: 'blue' }
    void state.values.color
    expect(events.filter(([code]) => code === 'engine:parse-miss')).toHaveLength(1)

    query.value = { n: '1', color: 'blue' }
    void state.values.n
    query.value = { n: 'bad', color: 'blue' }
    void state.values.n
    expect(events.filter(([code]) => code === 'engine:parse-miss')).toHaveLength(2)
  })

  it('reports an invalid path after observation attaches late', () => {
    const query = ref<ParsedQuery>({ n: 'bad', color: 'red' })
    const adapter = { query, navigate: vi.fn<QueryStateNavigate>() }
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const state = app.runWithContext(() => useQueryStates({ n: codecs.integer, color: codecs.string }))
    void state.values.n

    const events: DebugEvent[] = []
    trackReporter(addDebugReporter(event => events.push(event), {
      channel: getDebugChannel(adapter),
    }))
    query.value = { n: 'bad', color: 'blue' }
    void state.values.color

    expect(events.filter(event => event.code === 'engine:parse-miss')).toHaveLength(1)
  })

  it('reports the public path of an invalid prefixed param', () => {
    const events = captureEvents()
    const adapter = createTestingAdapter({ searchParams: { 'filters.page': 'bad' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const page = app.runWithContext(() => useQueryState(queryParam.object('filters', {
      page: codecs.integer,
    })))

    void page.value

    expect(events).toContainEqual([
      'engine:parse-miss',
      expect.objectContaining({ path: 'filters.page', raw: 'bad' }),
    ])
  })

  it('attributes malformed JSON once through the binding engine', () => {
    const events = captureEvents()
    const adapter = createTestingAdapter({ searchParams: { filters: '{bad' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)

    const { values } = app.runWithContext(() => useQueryStates({ filters: codecs.json() }))
    void values.filters
    void values.filters

    expect(events.filter(([code]) => code === 'engine:parse-miss')).toEqual([
      ['engine:parse-miss', expect.objectContaining({ path: 'filters', raw: '{bad' })],
    ])
  })
})
