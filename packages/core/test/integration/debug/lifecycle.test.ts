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
import { getDebugSnapshot } from '../../../src/core/diagnostics/snapshot'
import { ThrottledQueue } from '../../../src/core/runtime/navigation-queue'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { enableDebug } from '../../../src/debug'
import { withTestQuery } from '../../helpers/adapter'
import { captureCodes, captureEvents, flush, inOrder, resetDebugState, trackReporter } from '../../helpers/debug'

afterEach(resetDebugState)

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
    trackReporter(addDebugReporter(event => events.push(event)))
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
        trackReporter(addDebugReporter(event => events.push(event)))
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
    trackReporter(addDebugReporter(event => events.push(event)))
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
      navigate: vi.fn<QueryStateNavigate>(),
    }
    const codes: string[] = []
    trackReporter(addDebugReporter(event => codes.push(event.code), {
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
      navigate: vi.fn(async (next: ParsedQuery): Promise<void> => {
        query.value = { q: next.q }
      }),
    }
    const commits: DebugEvent[] = []
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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

    finish?.()
    await flush()

    expect(commits).toHaveLength(2)
    expect(commits[0]?.data).toMatchObject({ source: 'external', query: { q: 'external' } })
    expect(commits[1]?.data).toMatchObject({ source: 'write', query: { q: 'pending' } })
  })

  it('reports a synchronous commit before an external change queued by the adapter', async () => {
    const query = ref<ParsedQuery>({ q: 'initial' })
    const adapter = {
      query,
      navigate(next: ParsedQuery): void {
        query.value = next
        queueMicrotask(() => {
          query.value = { q: 'external' }
        })
      },
    }
    const commits: DebugEvent[] = []
    trackReporter(addDebugReporter((event) => {
      if (event.code === 'adapter:commit') {
        commits.push(event)
      }
    }, { channel: getDebugChannel(adapter) }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('write')
    await flush()

    expect(commits.map(event => event.data)).toEqual([
      { query: { q: 'write' }, paths: ['q'], pendingPathCount: 1, source: 'write' },
      { query: { q: 'external' }, paths: ['q'], pendingPathCount: 0, source: 'external' },
    ])
    expect(commits[0]?.context?.batchId).toBe(1)
    expect(commits[1]?.context?.batchId).toBeUndefined()
    expect(q.value).toBe('external')
  })

  it('carries one batch from transaction start through navigation and settlement', async () => {
    const byCode = new Map<string, DebugEvent['context']>()
    trackReporter(addDebugReporter(event => byCode.set(event.code, event.context)))

    const { run } = withTestQuery({ q: 'a' })
    const { values } = run(() => useQueryStates({ q: codecs.string }))

    values.q = 'b'
    await flush()

    for (const code of ['tx:start', 'binding:set', 'gtq:enqueue', 'gtq:schedule', 'gtq:flush', 'adapter:navigate', 'adapter:commit', 'gtq:settle']) {
      expect(byCode.get(code)).toMatchObject({ batchId: 1, transactionIds: [1] })
    }
  })

  it('attributes a parsed representation to its confirmed write once', async () => {
    const query = ref<ParsedQuery>({ n: 1 })
    const adapter = {
      query,
      navigate: vi.fn(async (): Promise<void> => {
        query.value = { n: 2 }
      }),
    }
    const events: DebugEvent[] = []
    trackReporter(addDebugReporter(event => events.push(event), { channel: getDebugChannel(adapter) }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const n = app.runWithContext(() => useQueryState('n', codecs.integer))

    n.set(2)
    await flush()

    const commits = events.filter(event => event.code === 'adapter:commit')
    expect(commits).toHaveLength(1)
    expect(commits[0]?.data).toEqual({ query: { n: 2 }, paths: ['n'], pendingPathCount: 1, source: 'write' })
    expect(commits[0]?.context).toMatchObject({ batchId: 1, transactionIds: [1] })
    expect(inOrder(events.map(event => event.code), ['adapter:commit', 'gtq:settle'])).toBe(true)
  })

  it('reports query changes as external after a rejected attempt', async () => {
    const query = ref<ParsedQuery>({ q: 'old' })
    const adapter = {
      query,
      navigate: vi.fn(async (): Promise<void> => {
        query.value = { q: 'external' }
        throw new Error('blocked')
      }),
    }
    const commits: DebugEvent[] = []
    trackReporter(addDebugReporter((event) => {
      if (event.code === 'adapter:commit') {
        commits.push(event)
      }
    }, { channel: getDebugChannel(adapter) }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('pending')
    await flush()

    expect(commits).toHaveLength(1)
    expect(commits[0]?.data).toMatchObject({ source: 'external', query: { q: 'external' } })
    expect(commits[0]?.context?.batchId).toBeUndefined()
    expect(q.value).toBe('external')
  })

  it('keeps completed simulations out of the pending queue and committed URL events', async () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'initial' } })
    const channel = getDebugChannel(adapter)
    const events: DebugEvent[] = []
    trackReporter(addDebugReporter(event => events.push(event), { channel }))
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('simulated')
    await flush()

    const snapshot = getDebugSnapshot(channel)
    expect(snapshot.queues).toEqual([expect.objectContaining({ overlay: {}, overlayKeys: [], scheduled: false })])
    expect(snapshot.engines).toEqual([expect.objectContaining({ committedSelected: { value: 'initial' }, values: { value: 'simulated' } })])
    expect(events.filter(event => event.code === 'adapter:commit')).toEqual([])
    expect(events.filter(event => event.code === 'gtq:settle')).toHaveLength(1)
  })

  it.each(['success', 'failure'] as const)('discards a simulation reset by a reporter during %s', async (outcome) => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ searchParams: { q: 'initial' }, onUrlUpdate })
    onUrlUpdate.mockImplementationOnce(() => {
      adapter.query.value = { q: 'external' }
      if (outcome === 'failure') {
        throw new Error('blocked')
      }
    })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))
    const resetValues: Array<string | undefined> = []
    const errors: DebugEvent[] = []
    trackReporter(addDebugReporter((event) => {
      if (event.code === 'adapter:error') {
        errors.push(event)
      }
      if (event.code === 'adapter:commit' && (event.data as { source: string }).source === 'external') {
        adapter.resetQueue()
        resetValues.push(q.value)
      }
    }, { channel: getDebugChannel(adapter) }))

    q.set('stale')
    await flush()

    expect(resetValues).toEqual(['external'])
    expect(errors).toEqual([])
    expect(q.value).toBe('external')
    expect(adapter.query.value).toEqual({ q: 'external' })

    q.set('fresh')
    await flush()

    expect(q.value).toBe('fresh')
    expect(onUrlUpdate).toHaveBeenCalledTimes(2)
  })

  it('omits transactionIds when a write carries no transaction id', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const seen: Array<readonly number[] | undefined> = []
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter(event => events.push(event), { channel: getDebugChannel(adapter) }))
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
    trackReporter(addDebugReporter(event => events.push(event), { channel: getDebugChannel(adapter) }))

    new ThrottledQueue(adapter).push({}, { history: 'push' }, 0)
    await flush()

    expect(events.find(event => event.code === 'gtq:flush-skip')?.context).toMatchObject({ batchId: 1 })
  })

  it('accumulates coalesced transaction ids until the flush', async () => {
    let flushIds: readonly number[] | undefined
    const coalesces: DebugEvent[] = []
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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
    trackReporter(addDebugReporter((event) => {
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
