import type { DebugEvent } from '../../src/core/debug/bus'
import type { ParsedQuery } from '../../src/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, ref } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { addDebugReporter, createDebugChannel, getDebugChannel } from '../../src/core/debug/bus'
import { createDebugLogger } from '../../src/core/debug/logger'
import { getDebugSnapshot } from '../../src/core/debug/snapshot'
import { queryParam } from '../../src/core/query-param'
import { ThrottledQueue } from '../../src/core/queues/throttle'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'
import { disableDebug, enableDebug } from '../../src/debug'
import { withContext } from '../../src/modules/context'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'
import { withStorage } from '../../src/modules/storage'
import { withTestQuery } from '../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const busDisposers: Array<() => void> = []

// Records the sequence of emitted codes through the structured bus, so tests assert
// lifecycle order without coupling to the exact log strings.
function captureCodes(): string[] {
  const codes: string[] = []
  busDisposers.push(addDebugReporter(event => codes.push(event.code)))
  return codes
}

// Records each emitted event as a `[code, data]` pair for structured payload assertions.
function captureEvents(): Array<[string, unknown]> {
  const events: Array<[string, unknown]> = []
  busDisposers.push(addDebugReporter(event => events.push([event.code, event.data])))
  return events
}

// Returns true when `seq` appears as an in-order subsequence of `codes`.
function inOrder(codes: string[], seq: string[]): boolean {
  let i = 0
  for (const code of codes) {
    if (code === seq[i]) {
      i++
    }
    if (i === seq.length) {
      return true
    }
  }
  return false
}

function fakeStorage(store: Record<string, string> = {}): Storage {
  return {
    setItem(key: string, value: string) {
      store[key] = value
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    removeItem(key: string) {
      delete store[key]
    },
  } as Storage
}

afterEach(() => {
  disableDebug()
  while (busDisposers.length > 0) {
    busDisposers.pop()?.()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('createDebugLogger', () => {
  it('emits namespaced module events on the bus at the matching level', () => {
    const captured: Array<{ code: string, level: string, data: unknown }> = []
    busDisposers.push(addDebugReporter(event => captured.push({ code: event.code, level: event.level, data: event.data })))

    const log = createDebugLogger('my-module')
    log.debug('resolved %O', { a: 1 })
    log.warn('bad input %s', 'x')

    expect(captured).toContainEqual({ code: 'module:log', level: 'debug', data: { namespace: 'my-module', message: 'resolved %O', values: [{ a: 1 }] } })
    expect(captured).toContainEqual({ code: 'module:warn', level: 'warn', data: { namespace: 'my-module', message: 'bad input %s', values: ['x'] } })
  })

  it('is a no-op when nothing is armed', () => {
    const log = createDebugLogger('my-module')
    expect(() => log.debug('x')).not.toThrow()
    expect(() => log.warn('y')).not.toThrow()
  })

  it('renders a module message through the opt-in console reporter', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    enableDebug()
    createDebugLogger('my-module').debug('did a thing')

    expect(logSpy).toHaveBeenCalledWith('[vuqs my-module] did a thing')
  })
})

describe('opt-in entry (@vuqs/core/debug)', () => {
  it('renders bus events to the console once enabled', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    enableDebug()
    const channel = createDebugChannel('opt')
    const context = { batchId: 1 }
    channel.debug('gtq:flush', { paths: ['q'], query: { q: 'x' }, options: {} }, context)
    channel.debug('adapter:commit', { paths: ['q'], query: { q: 'x' }, pendingPathCount: 1, source: 'write' }, context)

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated the URL: "q" = "x".')
  })

  it('renders warnings via console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    enableDebug()
    createDebugChannel('opt').warn('engine:parse-miss', { path: 'filters', raw: '{' })

    expect(warnSpy).toHaveBeenCalled()
  })

  it('stops rendering after disableDebug, leaving other reporters intact', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const other: string[] = []
    busDisposers.push(addDebugReporter(event => other.push(event.code)))

    enableDebug()
    disableDebug()
    createDebugChannel('opt').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
    expect(other).toContain('gtq:reset')
  })

  it('renders exactly once when enabled twice', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    enableDebug()
    enableDebug()
    const channel = createDebugChannel('opt')
    const context = { batchId: 1 }
    channel.debug('gtq:flush', { paths: ['q'], query: { q: 'x' }, options: {} }, context)
    channel.debug('adapter:commit', { paths: ['q'], query: { q: 'x' }, pendingPathCount: 1, source: 'write' }, context)

    expect(log).toHaveBeenCalledTimes(1)
  })

  it('a stale owner cannot dispose a newer console configuration', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const oldStop = enableDebug({ preset: 'summary' })
    enableDebug({ preset: 'trace' })

    oldStop()
    createDebugChannel('opt').debug('gtq:reset')

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain('gtq:reset')
  })

  it('the current owner disposes its own console projection', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stop = enableDebug({ preset: 'trace' })

    stop()
    createDebugChannel('opt').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('applies stored scope inclusion and exclusion during auto-enable', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({
      'vuqs:debug': JSON.stringify({
        version: 1,
        console: {
          enabled: true,
          filter: {
            include: { scopes: ['gtq'] },
            exclude: { scopes: ['tx'] },
          },
        },
      }),
    }))
    const bus = await import('../../src/core/debug/bus')
    await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = bus.createDebugChannel('scoped')

    const context = { batchId: 1 }
    channel.debug('gtq:flush', { paths: ['q'], query: { q: 'x' }, options: {} }, context)
    channel.debug('adapter:commit', { paths: ['q'], query: { q: 'x' }, pendingPathCount: 1, source: 'write' }, context)
    channel.debug('tx:start', { id: 1, mode: 'patch', paths: ['q'] }, { transactionIds: [1] })

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain('Updated the URL')
  })

  it('auto-enables rendering from the stored configuration', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({
      'vuqs:debug': JSON.stringify({ version: 1, console: { enabled: true } }),
    }))

    const bus = await import('../../src/core/debug/bus')
    await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const channel = bus.createDebugChannel('opt')
    const context = { batchId: 1 }
    channel.debug('gtq:flush', { paths: ['q'], query: { q: 'x' }, options: {} }, context)
    channel.debug('adapter:commit', { paths: ['q'], query: { q: 'x' }, pendingPathCount: 1, source: 'write' }, context)

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated the URL: "q" = "x".')
  })

  it('never auto-enables a process-global reporter on the server', async () => {
    vi.resetModules()
    vi.stubGlobal('window', undefined)

    const bus = await import('../../src/core/debug/bus')
    await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('server').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('does not auto-enable from the legacy debug key', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ debug: 'vuqs' }))

    const bus = await import('../../src/core/debug/bus')
    await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('browser-disabled').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('does not auto-enable when the stored console is disabled', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({
      'vuqs:debug': JSON.stringify({ version: 1, console: { enabled: false, preset: 'trace' } }),
    }))

    const bus = await import('../../src/core/debug/bus')
    await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('browser-disabled').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('warns once and stays disabled for an invalid stored configuration', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ 'vuqs:debug': '{' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const bus = await import('../../src/core/debug/bus')
    await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('browser-invalid').debug('gtq:reset')

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('Ignored invalid "vuqs:debug" configuration')
    expect(log).not.toHaveBeenCalled()
  })
})

describe('lifecycle tracing', () => {
  it('keeps the default console cardinality constant with many bindings', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    enableDebug()
    const { run } = withTestQuery()
    const states = run(() => [
      useQueryState('color', codecs.string),
      useQueryState('page', codecs.integer),
      useQueryState('q', codecs.string),
      useQueryState('sort', codecs.string),
      useQueryState('view', codecs.string),
      useQueryState('tab', codecs.string),
      useQueryState('size', codecs.integer),
    ])

    states[0]!.value = 'green'
    await flush()

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated the URL: "color" = "green".')
    expect(log.mock.calls.flat().join('\n')).not.toContain('engine:reconcile')
  })

  it('correlates a clear-on-default decision with the write batch', async () => {
    const events: DebugEvent[] = []
    busDisposers.push(addDebugReporter(event => events.push(event)))
    const { run } = withTestQuery({ page: '2' })
    const page = run(() => useQueryState('page', codecs.integer.withDefault(1)))

    page.value = 1
    await flush()

    const decision = events.find(event => event.code === 'engine:clear-on-default')
    expect(decision?.data).toMatchObject({ key: 'value', paths: ['page'], defaultValue: 1 })
    expect(decision?.context).toMatchObject({ transactionIds: [1], batchId: 1 })
  })

  it('tolerates a channel becoming armed inside default equality', async () => {
    const events: DebugEvent[] = []
    let armOnEquality = false
    const page = queryParam('page', codecs.integer.withDefault(1)).withEquality((a, b) => {
      if (armOnEquality) {
        armOnEquality = false
        busDisposers.push(addDebugReporter(event => events.push(event)))
      }
      return Object.is(a, b)
    })
    const { run } = withTestQuery({ page: '2' })
    const state = run(() => useQueryStates({ page }))

    armOnEquality = true
    expect(() => state.patch({ page: 1 })).not.toThrow()
    await flush()

    expect(events.some(event => event.code === 'binding:set')).toBe(true)
  })

  it('traces a write from transaction start through adapter-scoped settlement', async () => {
    const codes = captureCodes()
    const { run } = withTestQuery({ q: 'a' })
    const { values } = run(() => useQueryStates({ q: codecs.string }))

    values.q = 'b'
    await flush()

    expect(inOrder(codes, ['tx:start', 'binding:set', 'gtq:enqueue', 'gtq:flush', 'adapter:navigate', 'adapter:commit', 'gtq:settle'])).toBe(true)
    expect(codes).toContain('binding:created')
    expect(codes).toContain('binding:set')
  })

  it('reports an external committed-query change once at the adapter boundary', async () => {
    const events: DebugEvent[] = []
    busDisposers.push(addDebugReporter(event => events.push(event)))
    const { query, run } = withTestQuery({ q: 'a' })
    run(() => useQueryStates({ q: codecs.string }))

    query.value = { q: 'external' }
    await flush()

    const commits = events.filter(event => event.code === 'adapter:commit')
    expect(commits).toHaveLength(1)
    expect(commits[0]?.data).toEqual({ query: { q: 'external' }, paths: ['q'], pendingPathCount: 0, source: 'external' })
  })

  it('orders a synthetic no-op commit before settlement', async () => {
    const adapter = {
      query: ref<ParsedQuery>({ q: 'same' }),
      navigate: vi.fn(() => Promise.resolve()),
    }
    const codes: string[] = []
    busDisposers.push(addDebugReporter(event => codes.push(event.code), {
      channel: getDebugChannel(adapter),
    }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('same')
    await flush()

    expect(inOrder(codes, ['adapter:commit', 'gtq:settle'])).toBe(true)
  })

  it('attributes a canonicalized adapter commit once by attempted paths', async () => {
    const query = ref<ParsedQuery>({ unmanaged: undefined })
    const adapter = {
      query,
      navigate: vi.fn((next: ParsedQuery) => {
        query.value = { q: next.q }
      }),
    }
    const commits: DebugEvent[] = []
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'adapter:commit') {
        commits.push(event)
      }
    }, { channel: getDebugChannel(adapter) }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('sale')
    await flush()

    expect(commits).toHaveLength(1)
    expect(commits[0]?.data).toMatchObject({ source: 'write', query: { q: 'sale' } })
    expect(commits[0]?.context).toMatchObject({ batchId: 1, transactionIds: [1] })
  })

  it('keeps an unrelated external commit distinct while a write is pending', async () => {
    const query = ref<ParsedQuery>({ q: 'old' })
    let finish: (() => void) | undefined
    const adapter = {
      query,
      navigate: vi.fn((next: ParsedQuery) => new Promise<void>((resolve) => {
        finish = () => {
          query.value = next
          resolve()
        }
      })),
    }
    const commits: DebugEvent[] = []
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'adapter:commit') {
        commits.push(event)
      }
    }, { channel: getDebugChannel(adapter) }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('pending')
    await flush()
    query.value = { q: 'external' }

    expect(commits.at(-1)?.data).toMatchObject({ source: 'external', query: { q: 'external' } })
    finish?.()
    await flush()
  })

  it('carries one batch from transaction start through navigation and settlement', async () => {
    const byCode = new Map<string, DebugEvent['context']>()
    busDisposers.push(addDebugReporter(event => byCode.set(event.code, event.context)))

    const { run } = withTestQuery({ q: 'a' })
    const { values } = run(() => useQueryStates({ q: codecs.string }))

    values.q = 'b'
    await flush()

    for (const code of ['tx:start', 'binding:set', 'gtq:enqueue', 'gtq:schedule', 'gtq:flush', 'adapter:navigate', 'adapter:commit', 'gtq:settle']) {
      expect(byCode.get(code)).toMatchObject({ batchId: 1, transactionIds: [1] })
    }
  })

  it('omits transactionIds when a write carries no transaction id', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const seen: Array<readonly number[] | undefined> = []
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'gtq:enqueue' || event.code === 'gtq:flush') {
        seen.push(event.context?.transactionIds)
      }
    }, { channel: getDebugChannel(adapter) }))

    const queue = new ThrottledQueue(adapter)
    queue.push({ q: 'x' }, {}, 0)
    await flush()

    expect(seen).toEqual([undefined, undefined])
  })

  it('reports only paths whose serialized value changes in a flush', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    let flushed: DebugEvent | undefined
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'gtq:flush') {
        flushed = event
      }
    }, { channel: getDebugChannel(adapter) }))

    new ThrottledQueue(adapter).push({ q: 'phone', page: null }, {}, 0)
    await flush()

    expect(flushed?.data).toMatchObject({ paths: ['q'], query: { q: 'phone' } })
  })

  it('creates a correlation boundary when observation attaches after enqueue', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const queue = new ThrottledQueue(adapter)
    queue.push({ q: 'x' }, { history: 'push' }, 0, 7) // disarmed: retains no tx metadata

    const events: DebugEvent[] = []
    busDisposers.push(addDebugReporter(event => events.push(event), { channel: getDebugChannel(adapter) }))
    await flush()

    const flushed = events.find(event => event.code === 'gtq:flush')
    const navigated = events.find(event => event.code === 'adapter:navigate')
    expect(flushed?.context).toMatchObject({ batchId: 1 })
    expect(flushed?.context?.transactionIds).toBeUndefined()
    expect(navigated?.data).toMatchObject({ mode: 'push' })
  })

  it('correlates an observed flush-skip without leaking options', async () => {
    const adapter = createTestingAdapter()
    const events: DebugEvent[] = []
    busDisposers.push(addDebugReporter(event => events.push(event), { channel: getDebugChannel(adapter) }))

    new ThrottledQueue(adapter).push({}, { history: 'push' }, 0)
    await flush()

    expect(events.find(event => event.code === 'gtq:flush-skip')?.context).toMatchObject({ batchId: 1 })
  })

  it('accumulates coalesced transaction ids until the flush', async () => {
    let flushIds: readonly number[] | undefined
    const coalesces: DebugEvent[] = []
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'gtq:flush') {
        flushIds = event.context?.transactionIds
      }
      if (event.code === 'gtq:coalesce') {
        coalesces.push(event)
      }
    }))

    const { run } = withTestQuery({ q: 'a' })
    const { values } = run(() => useQueryStates({ q: codecs.string }))

    values.q = 'b'
    values.q = 'c'
    await flush()

    expect(flushIds).toEqual([1, 2])
    expect(coalesces).toHaveLength(1)
    expect(coalesces[0]?.context).toMatchObject({ batchId: 1, transactionIds: [1, 2] })
    expect(coalesces[0]?.data).toMatchObject({ writeCount: 2 })
  })

  it('assigns a fresh monotonic batch to the next flush window', async () => {
    const batches: number[] = []
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'gtq:flush') {
        batches.push(event.context?.batchId ?? -1)
      }
    }))
    const { run } = withTestQuery({ q: 'a' })
    const { values } = run(() => useQueryStates({ q: codecs.string }))

    values.q = 'b'
    await flush()
    values.q = 'c'
    await flush()

    expect(batches).toEqual([1, 2])
  })

  it('correlates an adapter rejection to the attempted batch without leaking it', async () => {
    const adapter = {
      debugName: 'rejecting',
      query: ref<ParsedQuery>({}),
      navigate: vi.fn(() => Promise.reject(new Error('blocked'))),
    }
    let failure: DebugEvent | undefined
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'adapter:error') {
        failure = event
      }
    }, { channel: getDebugChannel(adapter) }))

    new ThrottledQueue(adapter).push({ q: 'x' }, {}, 0, 9)
    await flush()

    expect(failure?.context).toMatchObject({ batchId: 1, transactionIds: [9] })
    expect(failure?.data).toMatchObject({ adapter: 'rejecting', error: expect.any(Error), rolledBack: ['q'] })
  })

  it('isolates a synchronous custom-adapter failure under the same batch', async () => {
    const adapter = {
      query: ref<ParsedQuery>({}),
      navigate: vi.fn(() => { throw new Error('sync failure') }),
    }
    let failure: DebugEvent | undefined
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'adapter:error') {
        failure = event
      }
    }, { channel: getDebugChannel(adapter) }))

    new ThrottledQueue(adapter).push({ q: 'x' }, {}, 0, 3)
    await flush()

    expect(failure?.context).toMatchObject({ batchId: 1, transactionIds: [3] })
    expect(failure?.data).toMatchObject({ adapter: 'custom', error: expect.any(Error), rolledBack: ['q'] })
  })

  it('orders coalesced transaction ids causally, even inserted out of order', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    let flushIds: readonly number[] | undefined
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'gtq:flush') {
        flushIds = event.context?.transactionIds
      }
    }, { channel: getDebugChannel(adapter) }))

    const queue = new ThrottledQueue(adapter)
    queue.push({ q: 'x' }, {}, 0, 2)
    queue.push({ p: 'y' }, {}, 0, 1)
    await flush()

    expect(flushIds).toEqual([1, 2])
  })

  it('drops stale transaction ids on reset', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    let flushIds: readonly number[] | undefined
    busDisposers.push(addDebugReporter((event) => {
      if (event.code === 'gtq:flush') {
        flushIds = event.context?.transactionIds
      }
    }, { channel: getDebugChannel(adapter) }))

    const queue = new ThrottledQueue(adapter)
    queue.push({ q: 'x' }, {}, 0, 1)
    queue.reset()
    queue.push({ p: 'y' }, {}, 0, 2)
    await flush()

    expect(flushIds).toEqual([2])
  })

  it('traces the adapter-scoped transaction start snapshot', () => {
    const { run } = withTestQuery()
    const query = run(() => useQueryStates({ q: codecs.string }))
    const events = captureEvents()

    query.patch({ q: 'sale' })

    expect(events).toContainEqual(['tx:start', expect.objectContaining({ id: 1, mode: 'patch', paths: ['q'] })])
  })
})

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
    const navigate = vi.fn()
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })

    const scope = effectScope()
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
    busDisposers.push(addDebugReporter(event => seen.push(event)))
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
    installQueryAdapter(app, { query, navigate: vi.fn() })
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
    const adapter = { query, navigate: vi.fn() }
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const state = app.runWithContext(() => useQueryStates({ n: codecs.integer, color: codecs.string }))
    void state.values.n

    const events: DebugEvent[] = []
    busDisposers.push(addDebugReporter(event => events.push(event), {
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

describe('adapter isolation', () => {
  it('publishes each adapter runtime only on its own channel', () => {
    const adapterA = createTestingAdapter()
    const adapterB = createTestingAdapter()
    const channelA = getDebugChannel(adapterA)
    const channelB = getDebugChannel(adapterB)
    expect(channelA.runtimeId).not.toBe(channelB.runtimeId)

    interface Seen { code: string, runtimeId?: string, value?: string }
    const written = (event: { code: string, context?: { runtimeId?: string }, data: unknown }): Seen => ({
      code: event.code,
      runtimeId: event.context?.runtimeId,
      value: (event.data as { values?: { q?: string } } | undefined)?.values?.q,
    })

    const onA: Seen[] = []
    const onHub: Seen[] = []
    // The adapter A reporter is channel-scoped. The hub reporter arms adapter B.
    busDisposers.push(addDebugReporter(event => onA.push(written(event)), { channel: channelA }))
    busDisposers.push(addDebugReporter(event => onHub.push(written(event))))

    const appA = createApp({})
    installQueryAdapter(appA, adapterA)
    const appB = createApp({})
    installQueryAdapter(appB, adapterB)

    const queryA = appA.runWithContext(() => useQueryStates({ q: codecs.string }))
    const queryB = appB.runWithContext(() => useQueryStates({ q: codecs.string }))

    queryA.patch({ q: 'a' })
    queryB.patch({ q: 'b' })

    // A's channel reporter sees only A's runtime and only A's write ('a'), never B's ('b').
    const aWrites = onA.filter(seen => seen.code === 'binding:set')
    expect(aWrites.length).toBeGreaterThan(0)
    expect(aWrites.every(seen => seen.runtimeId === channelA.runtimeId)).toBe(true)
    expect(aWrites.some(seen => seen.value === 'a')).toBe(true)
    expect(aWrites.some(seen => seen.value === 'b')).toBe(false)

    // The hub confirms that adapter B emitted its write on its own runtime.
    expect(onHub.some(seen => seen.code === 'binding:set' && seen.runtimeId === channelB.runtimeId && seen.value === 'b')).toBe(true)
  })

  it('attributes id-less binding-scoped events to distinct bindings sharing one adapter', () => {
    // Both bindings share one adapter, so their events require distinct binding ids.
    const { build } = withTestQuery({ q: 'x' })

    const events: DebugEvent[] = []
    busDisposers.push(addDebugReporter(event => events.push(event)))

    const tabA = ref('products')
    const tabB = ref('products')
    const a = build(() =>
      useQueryStates({ a: codecs.string, ca: codecs.string })
        .use(withRuntimeDefaults())
        .use(withContext({ active: tabA, preserve: ['a'], only: { ca: ['products'] } })),
    )
    const b = build(() =>
      useQueryStates({ b: codecs.string, cb: codecs.string })
        .use(withRuntimeDefaults())
        .use(withContext({ active: tabB, preserve: ['b'], only: { cb: ['products'] } })),
    )
    a.setDefaults({ a: 'da' })
    b.setDefaults({ b: 'db' })

    // Recover each binding's id from binding:created (its payload carries both id and keys).
    const idOf = (key: string): string | undefined => events.find(
      event => event.code === 'binding:created' && (event.data as { keys: string[] }).keys.includes(key),
    )?.context?.bindingId
    const idA = idOf('a')
    const idB = idOf('b')
    expect(idA).toBeDefined()
    expect(idB).toBeDefined()
    expect(idA).not.toBe(idB)

    // These event payloads carry no id. Their context must identify the binding,
    // and events from the two bindings must not share one.
    const idless = new Set(['pipeline:tap', 'rd:set', 'rd:register', 'ctx:build'])
    const scoped = events.filter(event => idless.has(event.code))
    expect(scoped.length).toBeGreaterThan(0)
    expect(scoped.every(event => event.context?.bindingId === idA || event.context?.bindingId === idB)).toBe(true)

    // Correlate by payload so a swapped attribution (A's event tagged idB) would fail:
    // the rd:set carrying `defaults.a` must be A's, and the one carrying `defaults.b`, B's.
    const rdSetFor = (key: string): DebugEvent | undefined => events.find(
      event => event.code === 'rd:set' && (event.data as { defaults: Record<string, unknown> }).defaults[key] !== undefined,
    )
    expect(rdSetFor('a')?.context?.bindingId).toBe(idA)
    expect(rdSetFor('b')?.context?.bindingId).toBe(idB)
  })
})

describe('state snapshot', () => {
  it('describes an adapter\'s engine and queue with resolved, detached values', () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'phone' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    app.runWithContext(() => useQueryStates({ q: codecs.string }))

    const channel = getDebugChannel(adapter)
    const snapshot = getDebugSnapshot(channel)

    expect(snapshot.engines).toHaveLength(1)
    expect(snapshot.engines[0]).toMatchObject({ runtimeId: channel.runtimeId, keys: ['q'], values: { q: 'phone' } })
    expect(snapshot.queues).toHaveLength(1)
    expect(snapshot.queues[0]).toMatchObject({ runtimeId: channel.runtimeId, overlayKeys: [] })

    // The snapshot must be detached: mutating it cannot change the engine's own state.
    ;(snapshot.engines[0]!.keys as string[]).splice(0)
    expect(getDebugSnapshot(channel).engines[0]!.keys).toEqual(['q'])
  })

  it('tags engine and storage entries with their runtime in the global aggregate', () => {
    const adapterA = createTestingAdapter({ searchParams: { q: 'aa' }, hasMemory: true })
    const adapterB = createTestingAdapter({ searchParams: { q: 'bb' }, hasMemory: true })
    const appA = createApp({})
    installQueryAdapter(appA, adapterA)
    const appB = createApp({})
    installQueryAdapter(appB, adapterB)
    appA.runWithContext(() => useQueryStates({ q: codecs.string }))
    appB.runWithContext(() => useQueryStates({ q: codecs.string }))

    const idA = getDebugChannel(adapterA).runtimeId
    const idB = getDebugChannel(adapterB).runtimeId
    const snapshot = getDebugSnapshot()

    expect(idA).not.toBe(idB)
    expect(snapshot.engines.find(engine => engine.values.q === 'aa')?.runtimeId).toBe(idA)
    expect(snapshot.engines.find(engine => engine.values.q === 'bb')?.runtimeId).toBe(idB)
  })

  it('registers and disposes a storage source on the server (SSR)', async () => {
    vi.stubGlobal('window', undefined)
    const adapter = createTestingAdapter()
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    const query = app.runWithContext(() => scope.run(() => useQueryStates({ q: codecs.string }).use(withStorage({
      key: 'ssr-only',
      storage: { load: () => undefined, save: vi.fn(), remove: vi.fn() },
    }))))!

    await query.storage.ready
    const channel = getDebugChannel(adapter)
    expect(getDebugSnapshot(channel).storage).toEqual([
      { runtimeId: channel.runtimeId, bindingId: expect.any(String), key: 'ssr-only', status: expect.any(String), revision: expect.any(Number) },
    ])

    scope.stop()
    expect(getDebugSnapshot(channel).storage).toEqual([])
  })

  it('drops an engine source when its scope disposes', () => {
    const adapter = createTestingAdapter()
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    app.runWithContext(() => scope.run(() => useQueryStates({ q: codecs.string })))
    const channel = getDebugChannel(adapter)
    expect(getDebugSnapshot(channel).engines).toHaveLength(1)

    scope.stop()

    expect(getDebugSnapshot(channel).engines).toHaveLength(0)
  })
})
