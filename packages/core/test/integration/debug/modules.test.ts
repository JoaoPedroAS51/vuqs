import type { DebugEvent } from '../../../src/core/diagnostics/bus'
import type { ParsedQuery } from '../../../src/core/query/types'
import type { QueryStateNavigate } from '../../../src/core/runtime/adapter'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, effectScope, ref, watch } from 'vue'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { addDebugReporter } from '../../../src/core/diagnostics/bus'
import { createDebugLogger } from '../../../src/core/diagnostics/logger'
import { withContext } from '../../../src/modules/context/module'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults/module'
import { withStorage } from '../../../src/modules/storage/module'
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

  it('traces a disposal before mirroring begins as a disposed restore outcome', async () => {
    vi.stubGlobal('window', {})
    const events = captureEvents()
    let resolveLoad!: () => void

    const { build, dispose } = withTestQuery()
    const query = build(() => useQueryStates({ q: codecs.string }).use(withStorage({
      key: 'filters',
      storage: {
        load: () => new Promise<undefined>((resolve) => {
          resolveLoad = () => resolve(undefined)
        }),
        save: vi.fn(),
        remove: vi.fn(),
      },
    })))
    await flush()

    dispose()
    resolveLoad()
    await query.storage.ready
    await flush()

    const outcomes = events.filter(([code]) => code === 'storage:restore')
    expect(outcomes).toEqual([['storage:restore', { key: 'filters', outcome: 'disposed' }]])
  })

  it('traces a disposal after mirroring begins with the restore outcome it reached', async () => {
    vi.stubGlobal('window', {})
    const events = captureEvents()

    const { build, dispose } = withTestQuery({ q: 'url' })
    const query = build(() => useQueryStates({ q: codecs.string }).use(withStorage({
      key: 'filters',
      storage: { load: () => undefined, save: vi.fn(), remove: vi.fn() },
      restore: 'never',
    })))

    // Disposing from the status observer lands after mirroring began and before ready settles
    const observerScope = effectScope(true)
    onTestFinished(() => observerScope.stop())

    observerScope.run(() => watch(query.storage.status, dispose, { flush: 'sync' }))

    const restoreOutcomes = () => events.filter(([code]) => code === 'storage:restore')

    await query.storage.ready

    expect(restoreOutcomes()).toEqual([])

    await flush()

    expect(restoreOutcomes()).toEqual([['storage:restore', { key: 'filters', outcome: 'mirror-only' }]])
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

  it('attributes an external module log to the binding and runtime of its writes', () => {
    const seen: DebugEvent[] = []
    trackReporter(addDebugReporter(event => seen.push(event)))
    const { build } = withTestQuery()
    const query = build(() => useQueryStates({ q: codecs.string }).use((core) => {
      const log = createDebugLogger('my-module', { target: core.debug })

      return {
        api: {
          write: () => {
            log.debug('writing %s', 'a')
            log.warn('careful')
            core.query.transact({ mode: 'patch', values: { q: 'a' } })
          },
        },
      }
    }))

    query.write()

    const logged = seen.filter(event => event.code === 'module:log' || event.code === 'module:warn')
    const write = seen.find(event => event.code === 'binding:set')

    expect(logged.map(event => event.code)).toEqual(['module:log', 'module:warn'])
    expect(logged[0]?.data).toEqual({ namespace: 'my-module', message: 'writing %s', values: ['a'] })
    expect(write?.context?.bindingId).toBeDefined()
    expect(write?.context?.runtimeId).toBeDefined()
    for (const event of logged) {
      expect(event.context?.bindingId).toBe(write?.context?.bindingId)
      expect(event.context?.runtimeId).toBe(write?.context?.runtimeId)
    }
  })

  it('keeps two bindings\' module logs apart', () => {
    const seen: DebugEvent[] = []
    trackReporter(addDebugReporter(event => seen.push(event)))
    const { build } = withTestQuery()
    const make = () => build(() => useQueryStates({ q: codecs.string }).use(core => ({
      api: { log: () => createDebugLogger('my-module', { target: core.debug }).debug('hi') },
    })))
    const first = make()
    const second = make()

    first.log()
    second.log()

    const logged = seen.filter(event => event.code === 'module:log')
    expect(logged).toHaveLength(2)
    expect(logged[0]?.context?.bindingId).not.toBe(logged[1]?.context?.bindingId)
    expect(logged[0]?.context?.runtimeId).toBe(logged[1]?.context?.runtimeId)
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
