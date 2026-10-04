import type { DebugEvent } from '../../../src/core/diagnostics/bus'
import type { ParsedQuery } from '../../../src/core/query/types'
import type { QueryStateNavigate } from '../../../src/core/runtime/adapter'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, effectScope, ref } from 'vue'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { addDebugReporter } from '../../../src/core/diagnostics/bus'
import { withContext } from '../../../src/modules/context'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withStorage } from '../../../src/modules/storage/storage'
import { withTestQuery } from '../../helpers/adapter'
import { captureCodes, captureEvents, flush, inOrder, resetDebugState, trackReporter } from '../../helpers/debug'

afterEach(resetDebugState)

describe('module tracing', () => {
  it('traces storage restoration and its canonical mirror write', async () => {
    vi.stubGlobal('window', {})
    const events = captureEvents()
    const storage = {
      load: () => ({ format: 1 as const, savedAt: 1, query: { q: 'stored' } }),
      save: vi.fn(),
      remove: vi.fn(),
    }
    const { build } = withTestQuery()
    const query = build(() => useQueryStates({ q: codecs.string }).use(withStorage({
      key: 'filters',
      storage,
    })))

    await query.storage.ready

    expect(events).toContainEqual(['storage:restore-start', expect.objectContaining({ key: 'filters', policy: 'if-empty' })])
    expect(events).toContainEqual(['tx:start', expect.objectContaining({ id: 1, mode: 'replace', paths: ['q'], origin: 'vuqs:storage' })])
    expect(events).toContainEqual(['storage:write', expect.objectContaining({ key: 'filters', revision: 1, operation: 'save', query: { q: 'stored' } })])
    expect(events).toContainEqual(['storage:restore', expect.objectContaining({ key: 'filters', outcome: 'restored' })])
  })

  it('traces an operational storage failure and restore result', async () => {
    vi.stubGlobal('window', {})
    const failure = new Error('load failed')
    const events = captureEvents()
    const { build } = withTestQuery()
    const query = build(() => useQueryStates({ q: codecs.string }).use(withStorage({
      key: 'filters',
      storage: {
        load: () => Promise.reject(failure),
        save: () => undefined,
        remove: () => undefined,
      },
    })))

    await query.storage.ready

    expect(events).toContainEqual(['storage:error', expect.objectContaining({ key: 'filters', operation: 'load', error: failure })])
    expect(events).toContainEqual(['storage:restore', expect.objectContaining({ key: 'filters', outcome: 'load-error' })])
  })

  it('traces a context change resetting runtime defaults', async () => {
    const tab = ref('products')
    const { build } = withTestQuery({ q: 'phone' })
    const schema = {
      q: codecs.string,
      category: codecs.string,
    }
    const q = build(() =>
      useQueryStates(schema)
        .use(withRuntimeDefaults())
        .use(withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } })),
    )
    q.setDefaults({ category: 'phones' })

    const codes = captureCodes()
    tab.value = 'reviews'
    await flush()

    expect(inOrder(codes, ['ctx:change', 'rd:reset'])).toBe(true)
  })

  it('traces default layer registration and disposal', () => {
    const events = captureEvents()

    const query = ref<ParsedQuery>({})
    const navigate = vi.fn<QueryStateNavigate>()
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })

    const scope = effectScope()
    onTestFinished(() => scope.stop())
    app.runWithContext(() =>
      scope.run(() => useQueryStates({ q: codecs.string }).use(withRuntimeDefaults())),
    )
    scope.stop()

    expect(events).toContainEqual(['rd:register', expect.objectContaining({ state: 'registered' })])
    expect(events).toContainEqual(['rd:register', expect.objectContaining({ state: 'disposed' })])
  })

  it('traces setDefaults when armed', () => {
    const events = captureEvents()
    const { build } = withTestQuery()
    const query = build(() => useQueryStates({ q: codecs.string }).use(withRuntimeDefaults()))

    query.setDefaults({ q: 'x' })

    expect(events).toContainEqual(['rd:set', expect.objectContaining({ defaults: { q: 'x' } })])
  })

  it('traces the single-param runtime-default API with binding attribution', () => {
    const seen: DebugEvent[] = []
    trackReporter(addDebugReporter(event => seen.push(event)))
    const { build } = withTestQuery()
    const query = build(() => useQueryState('q', codecs.string).use(withRuntimeDefaults()))

    query.setDefault('x')
    query.clearDefault()

    const events = seen.filter(event => event.code === 'rd:set' || event.code === 'rd:clear')
    expect(events.map(event => event.code)).toEqual(['rd:set', 'rd:clear'])
    expect(events[0]?.data).toEqual({ defaults: { value: 'x' } })
    expect(events.every(event => event.context?.bindingId !== undefined)).toBe(true)
  })

  it('traces the context-switch query build when armed', () => {
    const events = captureEvents()
    const tab = ref('products')
    const navigate = vi.fn()
    const { build } = withTestQuery({ q: 'phone', category: 'phones' })
    const query = build(() =>
      useQueryStates({ q: codecs.string, category: codecs.string })
        .use(withContext({ active: tab, navigate, preserve: ['q'], only: { category: ['products'] } })),
    )

    query.switchTo('reviews')

    expect(events).toContainEqual(['ctx:switch', expect.objectContaining({ to: 'reviews' })])
    expect(events).toContainEqual(['ctx:build', expect.objectContaining({ kept: expect.any(Array), dropped: expect.any(Array) })])
  })
})
