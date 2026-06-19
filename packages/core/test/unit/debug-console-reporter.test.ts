import type { DebugEventCode, DebugEventMap, DebugScope } from '../../src/core/debug/events'
import type { ConsoleReporterOptions } from '../../src/debug/console-reporter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebugChannel, globalDebugChannel } from '../../src/core/debug/bus'
import { createConsoleReporter } from '../../src/debug/console-reporter'
import { DEBUG_EVENT_CATALOG, DEBUG_EVENT_ENTRIES } from '../../src/debug/event-catalog'
import { createPerformanceReporter } from '../../src/debug/performance-reporter'

const disposers: Array<() => void> = []

function withReporter(options: ConsoleReporterOptions = {}) {
  const channel = createDebugChannel('rt-console')
  disposers.push(channel.addReporter(createConsoleReporter(options)))
  return channel
}

const TRACE_PAYLOADS = {
  'binding:created': { id: 'b', keys: ['color'], managedPaths: ['color'] },
  'binding:disposed': { id: 'b', keys: ['color'], managedPaths: ['color'] },
  'binding:set': { id: 'b', keys: ['color'], managedPaths: ['color'], touched: ['color'], touchedPaths: ['color'], values: { color: 'green' }, options: {} },
  'engine:clear-on-default': { id: 'b', keys: ['page'], key: 'page', paths: ['page'], defaultValue: 1 },
  'engine:parse-miss': { path: 'page', raw: 'bad' },
  'gtq:enqueue': { deltas: { color: 'green' }, pendingPathCount: 2 },
  'gtq:coalesce': { previous: {}, incoming: { history: 'push' }, resolved: { history: 'push' }, writeCount: 2 },
  'gtq:schedule': { delayMs: 0, mechanism: 'microtask' },
  'gtq:flush': { paths: ['color', 'page'], query: { color: 'green', page: 2 }, options: {} },
  'gtq:flush-skip': { reason: 'no paths' },
  'gtq:settle': { dropped: ['color', 'page'] },
  'gtq:reset': undefined,
  'tx:start': { id: 1, mode: 'patch', paths: ['color'], origin: 'test' },
  'adapter:navigate': { adapter: 'vue-router', mode: 'replace', query: { color: 'green' } },
  'adapter:commit': { query: { color: 'green' }, paths: ['color'], pendingPathCount: 0, source: 'write' },
  'adapter:error': { adapter: 'vue-router', error: new Error('nav'), rolledBack: ['color'] },
  'adapter:missing': undefined,
  'hooks:subscribe': { event: 'context:change' },
  'hooks:emit': { event: 'context:change', args: ['reviews'] },
  'pipeline:tap': { stages: ['read'], enforce: 'pre' },
  'rd:set': { defaults: {} },
  'rd:clear': undefined,
  'rd:reset': { context: 'reviews' },
  'rd:register': { state: 'registered' },
  'ctx:build': { kept: ['search'], dropped: ['category'] },
  'ctx:switch': { to: 'reviews' },
  'ctx:change': { context: 'reviews', valid: ['search'], invalid: ['category'] },
  'storage:restore-start': { key: 'filters', policy: 'if-empty' },
  'storage:restore': { key: 'filters', outcome: 'restored' },
  'storage:write': { key: 'filters', revision: 3, operation: 'save', query: { q: 'x' } },
  'storage:coalesce': { key: 'filters', from: 2, to: 3 },
  'storage:error': { key: 'filters', operation: 'save', error: new Error('disk') },
  'serializer:clear-on-default': { key: 'page' },
  'serializer:build': { query: { color: 'green', page: 2 } },
  'module:log': { namespace: 'module', message: 'hello', values: [] },
  'module:warn': { namespace: 'module', message: 'careful', values: [] },
} satisfies { [Code in DebugEventCode]: DebugEventMap[Code] }

function formatCatalogTrace<Code extends DebugEventCode>(code: Code, data: DebugEventMap[Code]): string {
  return (DEBUG_EVENT_CATALOG[code].formatTrace as (payload: DebugEventMap[Code], raw: DebugEventMap[Code]) => string)(data, data)
}

function emitCommittedWrite(
  channel: ReturnType<typeof createDebugChannel>,
  batchId: number,
  paths: string[],
  query: DebugEventMap['gtq:flush']['query'],
  options: DebugEventMap['gtq:flush']['options'] = {},
): void {
  const context = { batchId }
  channel.debug('gtq:flush', { paths, query, options }, context)
  channel.debug('adapter:commit', { query, paths, pendingPathCount: paths.length, source: 'write' }, context)
}

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('console reporter: summary', () => {
  it('aggregates a complete write lifecycle into one human result', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()
    const context = { bindingId: '7', transactionIds: [2], batchId: 3 }

    channel.debug('binding:created', { id: '7', keys: ['color'], managedPaths: ['color'] }, { bindingId: '7' })
    channel.debug('binding:set', { id: '7', keys: ['color'], managedPaths: ['color'], touched: ['color'], touchedPaths: ['color'], values: { color: 'green' }, options: { history: 'replace' } }, context)
    channel.debug('gtq:enqueue', { deltas: { color: 'green' }, pendingPathCount: 1 }, context)
    channel.debug('gtq:schedule', { delayMs: 0, mechanism: 'microtask' }, context)
    channel.debug('gtq:flush', { paths: ['color'], query: { color: 'green' }, options: { history: 'replace' } }, context)
    channel.debug('adapter:navigate', { adapter: 'testing', mode: 'replace', query: { color: 'green' } }, context)
    channel.debug('adapter:commit', { query: { color: 'green' }, paths: ['color'], pendingPathCount: 1, source: 'write' }, context)
    channel.debug('gtq:settle', { dropped: ['color'] }, context)

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated the URL: "color" = "green".')
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      context: { runtimeId: 'rt-console', bindingId: '7', transactionIds: [2], batchId: 3 },
      data: {
        changes: { color: 'green' },
        navigation: { history: 'replace' },
      },
    })
  })

  it('describes coalesced push navigation without exposing correlation ids in the message', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()
    const context = { batchId: 4, transactionIds: [1] }

    channel.debug('gtq:flush', {
      paths: ['color', 'page', 'sort'],
      query: { color: 'green', page: 2, sort: 'price' },
      options: { history: 'push' },
    }, context)
    channel.debug('adapter:commit', {
      query: { color: 'green', page: 2, sort: 'price' },
      paths: ['color', 'page', 'sort'],
      pendingPathCount: 3,
      source: 'write',
    }, context)

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated 3 URL parameters in one navigation and added a browser history entry: "color" = "green", "page" = 2, and "sort" = "price".')
    expect(log.mock.calls[0]?.[0]).not.toMatch(/tx#|batch#|rt-console/)
  })

  it('folds a clear-on-default decision into the committed write', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()
    const context = { bindingId: 'page', transactionIds: [1], batchId: 1 }

    channel.debug('engine:clear-on-default', {
      id: 'page',
      keys: ['value'],
      key: 'value',
      paths: ['page'],
      defaultValue: 1,
    }, context)
    channel.debug('gtq:flush', { paths: ['page'], query: {}, options: {} }, context)
    channel.debug('adapter:commit', { query: {}, paths: ['page'], pendingPathCount: 1, source: 'write' }, context)

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] "page" now uses its default value (1), so the URL does not need a "page" parameter.')
  })

  it('omits default canonicalization that does not change the URL', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()
    const context = { bindingId: 'page', transactionIds: [1], batchId: 1 }

    channel.debug('engine:clear-on-default', {
      id: 'page',
      keys: ['value'],
      key: 'value',
      paths: ['page'],
      defaultValue: 1,
    }, context)
    channel.debug('gtq:flush', { paths: [], query: {}, options: {} }, context)
    channel.debug('adapter:commit', { query: {}, paths: ['page'], pendingPathCount: 1, source: 'write' }, context)

    expect(log).not.toHaveBeenCalled()
  })

  it('does not count an unchanged default path in a mixed write summary', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()
    const context = { bindingId: 'filters', transactionIds: [1], batchId: 1 }

    channel.debug('engine:clear-on-default', {
      id: 'filters',
      keys: ['q', 'page'],
      key: 'page',
      paths: ['page'],
      defaultValue: 0,
    }, context)
    channel.debug('gtq:flush', { paths: ['q'], query: { q: 'phone' }, options: {} }, context)
    channel.debug('adapter:commit', { query: { q: 'phone' }, paths: ['q', 'page'], pendingPathCount: 2, source: 'write' }, context)

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated the URL: "q" = "phone".')
  })

  it('describes only the changed paths for an external URL commit', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()

    channel.debug('adapter:commit', { query: { q: 'external', stable: 'yes' }, paths: ['q'], pendingPathCount: 0, source: 'external' })

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] The URL changed outside vuqs; synchronized "q".')
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      context: { runtimeId: 'rt-console' },
      data: { query: { q: 'external' } },
    })
  })

  it('routes navigation and storage failures to console.warn with actionable prose', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channel = withReporter()
    const error = new Error('disk full')

    channel.warn('adapter:error', { adapter: 'custom', error: new Error('nav'), rolledBack: ['color', 'page'] })
    channel.warn('storage:error', { key: 'filters', operation: 'save', error })

    expect(warn.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Could not update the URL; restored the previous values of "color" and "page".',
      '[vuqs] Could not save "filters" to storage.',
    ])
    expect(warn.mock.calls[1]?.[1]).toMatchObject({
      context: { runtimeId: 'rt-console' },
      data: { error: { message: 'disk full' } },
    })
  })

  it('preserves module placeholders with previewed values', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()

    channel.debug('module:log', { namespace: 'my-module', message: 'resolved %O', values: [{ a: 1 }] })

    expect(log).toHaveBeenCalledWith('[vuqs my-module] resolved %O', { a: 1 })
  })

  it('renders explicit state decisions and suppresses routine storage outcomes', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channel = withReporter()

    channel.warn('engine:parse-miss', { path: 'q', raw: 'bad' })
    channel.debug('rd:set', { defaults: { q: 'x' } })
    channel.debug('rd:clear')
    channel.debug('rd:reset', { context: 'reviews' })
    channel.debug('ctx:change', { context: 'reviews', valid: ['q'], invalid: ['category'] })
    channel.debug('storage:restore', { key: 'filters', outcome: 'empty' })
    channel.debug('storage:restore', { key: 'filters', outcome: 'restored' })
    channel.debug('storage:restore', { key: 'filters', outcome: 'url-won' })

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Set the runtime default: "q" = "x".',
      '[vuqs] Cleared the runtime defaults.',
      '[vuqs] Cleared the runtime defaults after the query context changed to "reviews".',
      '[vuqs] Changed the query context to "reviews"; "category" is no longer valid.',
      '[vuqs] Applied saved query state from "filters".',
      '[vuqs] Kept the current URL instead of restoring "filters" because the URL already contains query state.',
    ])
    expect(warn.mock.calls[0]?.[0]).toBe('[vuqs] Ignored an invalid URL value for "q" because it could not be decoded.')
  })

  it('covers concise write variants without leaking values in hidden mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const visible = withReporter()
    const hidden = withReporter({ payload: 'hidden' })

    emitCommittedWrite(visible, 1, ['page'], {})
    emitCommittedWrite(visible, 2, ['page'], {}, { history: 'push' })
    emitCommittedWrite(visible, 3, ['active'], { active: true })
    emitCommittedWrite(visible, 4, ['tags'], { tags: ['a', 2, null] })
    emitCommittedWrite(visible, 5, ['filters'], { filters: { sort: 'name' } })
    emitCommittedWrite(visible, 6, ['token'], { token: 'secret' })
    emitCommittedWrite(visible, 7, ['tags'], { tags: ['a', 'b', 'c', 'd'] })
    emitCommittedWrite(visible, 8, ['q'], { q: 'x' }, { history: 'push' })
    emitCommittedWrite(hidden, 9, ['token'], { token: 'secret' }, { history: 'push' })
    emitCommittedWrite(hidden, 10, ['a', 'b'], { a: 1, b: 2 }, { history: 'push' })
    const hiddenDefaultContext = { batchId: 11, bindingId: 'page' }
    hidden.debug('engine:clear-on-default', {
      id: 'page',
      keys: ['value'],
      key: 'value',
      paths: ['page'],
      defaultValue: 1,
    }, hiddenDefaultContext)
    hidden.debug('gtq:flush', { paths: ['page'], query: {}, options: {} }, hiddenDefaultContext)
    hidden.debug('adapter:commit', { query: {}, paths: ['page'], pendingPathCount: 1, source: 'write' }, hiddenDefaultContext)

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Removed "page" from the URL.',
      '[vuqs] Removed "page" from the URL and added a browser history entry.',
      '[vuqs] Updated the URL: "active" = true.',
      '[vuqs] Updated the URL: "tags" = ["a", 2, null].',
      '[vuqs] Updated the URL parameter "filters".',
      '[vuqs] Updated the URL: "token" = [Redacted].',
      '[vuqs] Updated the URL parameter "tags".',
      '[vuqs] Updated the URL and added a browser history entry: "q" = "x".',
      '[vuqs] Updated the URL parameter "token" and added a browser history entry.',
      '[vuqs] Updated 2 URL parameters in one navigation and added a browser history entry: "a" and "b".',
      '[vuqs] "page" now uses its default value, so the URL does not need a "page" parameter.',
    ])
  })

  it('renders large, mixed, redacted, and default-clearing batches safely', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()

    emitCommittedWrite(channel, 1, ['a', 'b', 'c', 'd'], { a: 1, b: 2, c: 3, d: 4 })
    emitCommittedWrite(channel, 4, ['a', 'b', 'c', 'd'], { a: 1, b: 2, c: 3, d: 4 }, { history: 'push' })
    emitCommittedWrite(channel, 2, ['a', 'b'], { a: { nested: true } })

    const context = { batchId: 3, bindingId: 'filters' }
    channel.debug('engine:clear-on-default', {
      id: 'filters',
      keys: ['filters'],
      key: 'filters',
      paths: ['filters.sort'],
      defaultValue: { sort: 'name' },
    }, context)
    channel.debug('gtq:flush', { paths: ['filters.sort'], query: {}, options: { history: 'push' } }, context)
    channel.debug('adapter:commit', { query: {}, paths: ['filters.sort'], pendingPathCount: 1, source: 'write' }, context)

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated 4 URL parameters in one navigation: "a", "b", "c", and 1 more parameter.')
    expect(log.mock.calls[1]?.[0]).toBe('[vuqs] Updated 4 URL parameters in one navigation and added a browser history entry: "a", "b", "c", and 1 more parameter.')
    expect(log.mock.calls[2]?.[0]).toBe('[vuqs] Updated 2 URL parameters in one navigation: updated "a" and removed "b".')
    expect(log.mock.calls[3]?.[0]).toBe('[vuqs] "filters" now uses its default value, so the URL does not need a "filters" parameter. Added a browser history entry.')
  })

  it('covers terminal fallbacks, context variants, and every storage failure operation', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channel = withReporter()

    channel.debug('adapter:commit', { query: {}, paths: [], pendingPathCount: 0, source: 'external' })
    channel.debug('adapter:commit', { query: {}, paths: [], pendingPathCount: 0, source: 'write' })
    channel.debug('adapter:commit', { query: { q: 'x' }, paths: ['q'], pendingPathCount: 0, source: 'write' })
    channel.debug('ctx:change', { context: 'empty', valid: [], invalid: [] })
    channel.debug('ctx:change', { context: 'many', valid: [], invalid: ['a', 'b'] })
    channel.warn('adapter:error', { adapter: 'custom', error: new Error('failed') })
    channel.warn('adapter:error', { adapter: 'custom', error: new Error('failed'), rolledBack: ['q'] })

    for (const operation of ['save', 'remove', 'serialize', 'load', 'snapshot', 'restore'] as const) {
      channel.warn('storage:error', { key: 'filters', operation, error: new Error(operation) })
    }

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] The URL changed outside vuqs.',
      '[vuqs] Updated the URL.',
      '[vuqs] Updated "q" in the URL.',
      '[vuqs] Changed the query context to "empty".',
      '[vuqs] Changed the query context to "many"; "a" and "b" are no longer valid.',
    ])
    expect(warn.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] The "custom" adapter could not update the URL.',
      '[vuqs] Could not update the URL; restored the previous value of "q".',
      '[vuqs] Could not save "filters" to storage.',
      '[vuqs] Could not remove "filters" from storage.',
      '[vuqs] Could not prepare "filters" for storage.',
      '[vuqs] Could not load "filters" from storage.',
      '[vuqs] Ignored invalid stored query state for "filters".',
      '[vuqs] Could not restore "filters" from storage.',
    ])
  })

  it('handles empty and truncated runtime defaults plus custom-redactor shapes', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const regular = withReporter()
    const primitive = withReporter({ redact: () => null })
    const array = withReporter({ redact: () => ({ data: { defaults: [] } }) })
    const complex = withReporter({ redact: preview => ({ ...(preview as object), data: { defaults: { q: { nested: true } } } }) })
    const labelsHidden = withReporter({ redact: () => ({ data: { defaults: {} } }) })

    regular.debug('rd:set', { defaults: {} })
    regular.debug('rd:set', { defaults: { a: 1, b: 2, c: 3, d: 4 } })
    primitive.debug('rd:set', { defaults: { q: 'secret' } })
    array.debug('rd:set', { defaults: { q: 'secret' } })
    complex.debug('rd:set', { defaults: { q: 'secret' } })
    labelsHidden.debug('rd:set', { defaults: { q: 'secret' } })

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Set an empty runtime-default layer.',
      '[vuqs] Set 4 runtime defaults: "a" = 1, "b" = 2, "c" = 3, and 1 more default.',
      '[vuqs] Updated the runtime defaults.',
      '[vuqs] Updated the runtime defaults.',
      '[vuqs] Set the runtime default: "q".',
      '[vuqs] Set 1 runtime default.',
    ])
  })

  it('cleans only the reset runtime aggregate and ignores filtered or uncorrelated inputs', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const reporter = createConsoleReporter({ filter: { include: { scopes: ['adapter'] } } })
    const now = Date.now()

    reporter({ code: 'binding:set', scope: 'binding', level: 'debug', seq: 1, timestamp: now, context: { runtimeId: 'a' }, data: TRACE_PAYLOADS['binding:set'] })
    reporter({ code: 'binding:set', scope: 'binding', level: 'debug', seq: 2, timestamp: now, context: { runtimeId: 'a', batchId: 1 }, data: TRACE_PAYLOADS['binding:set'] })
    reporter({ code: 'engine:clear-on-default', scope: 'engine', level: 'debug', seq: 2, timestamp: now, context: { runtimeId: 'a', batchId: 8 }, data: TRACE_PAYLOADS['engine:clear-on-default'] })
    reporter({ code: 'gtq:flush', scope: 'gtq', level: 'debug', seq: 2, timestamp: now, context: { runtimeId: 'a', batchId: 9 }, data: TRACE_PAYLOADS['gtq:flush'] })

    const globalReporter = createConsoleReporter()
    globalReporter({ code: 'binding:set', scope: 'binding', level: 'debug', seq: 2, timestamp: now, context: undefined, data: TRACE_PAYLOADS['binding:set'] })
    globalReporter({ code: 'binding:set', scope: 'binding', level: 'debug', seq: 3, timestamp: now, context: { runtimeId: 'a', batchId: 1 }, data: TRACE_PAYLOADS['binding:set'] })
    globalReporter({ code: 'binding:set', scope: 'binding', level: 'debug', seq: 4, timestamp: now, context: { runtimeId: 'b', batchId: 1 }, data: TRACE_PAYLOADS['binding:set'] })
    globalReporter({ code: 'binding:set', scope: 'binding', level: 'debug', seq: 4, timestamp: now, context: { batchId: 2 }, data: TRACE_PAYLOADS['binding:set'] })
    globalReporter({ code: 'gtq:reset', scope: 'gtq', level: 'debug', seq: 5, timestamp: now, context: { runtimeId: 'a' }, data: undefined })
    globalReporter({ code: 'gtq:reset', scope: 'gtq', level: 'debug', seq: 5, timestamp: now, context: undefined, data: undefined })
    globalReporter({ code: 'adapter:commit', scope: 'adapter', level: 'debug', seq: 6, timestamp: now, context: { runtimeId: 'b', batchId: 1 }, data: { query: { q: 'x' }, paths: ['q'], pendingPathCount: 1, source: 'write' } })

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated "q" in the URL.')
  })
})

describe('console reporter: trace and filters', () => {
  it('keeps trace prose and documentation metadata exhaustive for every protocol event', () => {
    expect(DEBUG_EVENT_ENTRIES).toHaveLength(36)

    for (const [code, reference] of DEBUG_EVENT_ENTRIES) {
      const prose = (reference.formatTrace as (payload: unknown, raw: unknown) => string)(TRACE_PAYLOADS[code], TRACE_PAYLOADS[code])
      expect(prose).toBeTruthy()
      expect(reference.emittedWhen).toBeTruthy()
      if (reference.summary === 'trace-only') {
        expect(reference.summaryNote).toBeUndefined()
        expect(reference.summaryExample).toBeUndefined()
      }
      else {
        expect(reference.summaryNote).toBeTruthy()
        if (reference.summary !== 'aggregate') {
          expect(reference.summaryExample).toBeTruthy()
        }
      }
    }

    expect(formatCatalogTrace('gtq:schedule', { delayMs: 25, mechanism: 'timer' })).toContain('in 25 ms')
    expect(formatCatalogTrace('binding:created', { id: 's', keys: ['value'], managedPaths: ['color'] })).toContain('"color"')
    expect(formatCatalogTrace('binding:set', { id: 's', keys: ['value'], managedPaths: ['color'], touched: ['value'], touchedPaths: ['color'], values: { value: 'green' }, options: {} })).toContain('"color"')
    expect(formatCatalogTrace('engine:clear-on-default', { id: 's', keys: ['value'], key: 'value', paths: ['page'], defaultValue: 1 })).toContain('"page"')
    expect(formatCatalogTrace('engine:clear-on-default', { id: 's', keys: ['value'], key: 'value', paths: ['a', 'b'], defaultValue: {} })).toContain('"value"')
    expect(formatCatalogTrace('adapter:commit', { query: {}, paths: ['q'], pendingPathCount: 0, source: 'external' })).toContain('external URL change')
    expect(formatCatalogTrace('pipeline:tap', { stages: ['read', 'write'], enforce: 'post' })).toContain('pipelines')
    expect(formatCatalogTrace('rd:register', { state: 'disposed' })).toContain('Disposed')
    expect(formatCatalogTrace('rd:set', { defaults: { color: 'green' } })).toContain('"color"')
    expect(formatCatalogTrace('ctx:change', { context: 'reviews', valid: [], invalid: [] })).toBe('Changed the query context to "reviews".')
    expect(formatCatalogTrace('ctx:change', { context: 'reviews', valid: [], invalid: ['a', 'b'] })).toContain('are no longer valid')
    expect(formatCatalogTrace('ctx:build', { kept: [], dropped: [] })).toContain('no parameters')
    expect(formatCatalogTrace('storage:restore-start', { key: 'filters', policy: 'never' })).toContain('mirroring')
    expect(formatCatalogTrace('storage:write', { key: 'filters', revision: 4, operation: 'remove', query: {} })).toContain('removing')
  })

  it('keeps every documented summary example executable by its real renderer', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    for (const [code, reference] of DEBUG_EVENT_ENTRIES) {
      if (reference.summaryExample === undefined) {
        continue
      }
      log.mockClear()
      warn.mockClear()
      createConsoleReporter()({
        code,
        scope: code.split(':', 1)[0] as DebugScope,
        level: reference.level,
        seq: 1,
        timestamp: Date.now(),
        data: TRACE_PAYLOADS[code],
      })

      const call = reference.level === 'warn' ? warn.mock.calls[0] : log.mock.calls[0]
      expect(call?.[0], code).toBe(reference.summaryExample)
    }
  })

  it('renders unknown future events defensively without exposing them in summary', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const event = { code: 'future:event', scope: 'future', level: 'debug' as const, seq: 1, timestamp: Date.now(), data: {} }

    createConsoleReporter({ preset: 'trace' })(event)
    createConsoleReporter({ preset: 'summary' })(event)

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs trace] future:event — Observed an unknown debug event.')
  })

  it('prints every selected event with human prose and structured technical details', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ preset: 'trace' })

    channel.debug('binding:created', { id: 'b', keys: ['q'], managedPaths: ['q'] }, { bindingId: 'b' })
    channel.debug('gtq:enqueue', { deltas: { q: 'x' }, pendingPathCount: 1 }, { bindingId: 'b', transactionIds: [1], batchId: 2 })

    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[1]?.[0]).toBe('[vuqs trace] gtq:enqueue — Queued 1 URL change; 1 path is now pending.')
    expect(log.mock.calls[1]?.[1]).toMatchObject({
      sequence: expect.any(Number),
      scope: 'gtq',
      context: { runtimeId: 'rt-console', bindingId: 'b', transactionIds: [1], batchId: 2 },
      data: { deltas: { q: 'x' } },
    })
  })

  it('applies include then exclude before rendering', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({
      preset: 'trace',
      filter: { include: { scopes: ['gtq'] }, exclude: { codes: ['gtq:schedule'] } },
    })

    channel.debug('binding:created', { id: 'b', keys: ['q'], managedPaths: ['q'] }, { bindingId: 'b' })
    channel.debug('gtq:schedule', { delayMs: 0, mechanism: 'microtask' })
    channel.debug('gtq:reset')

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain('gtq:reset')
  })

  it('an explicit terminal exclusion overrides a pending summary aggregate', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({
      filter: {
        include: { scopes: ['gtq'] },
        exclude: { scopes: ['adapter'] },
      },
    })

    emitCommittedWrite(channel, 1, ['q'], { q: 'included upstream' })

    expect(log).not.toHaveBeenCalled()
  })

  it('a flush does not create a summary for an excluded binding', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ filter: { exclude: { bindingIds: ['binding-b'] } } })
    const batch = { batchId: 1, transactionIds: [1] }

    channel.debug('binding:set', {
      id: 'binding-b',
      keys: ['b'],
      managedPaths: ['b'],
      touched: ['b'],
      touchedPaths: ['b'],
      values: { b: 'excluded' },
      options: {},
    }, { ...batch, bindingId: 'binding-b' })
    channel.debug('gtq:flush', { paths: ['b'], query: { b: 'excluded' }, options: {} }, batch)
    channel.debug('adapter:commit', {
      query: { b: 'excluded' },
      paths: ['b'],
      pendingPathCount: 1,
      source: 'write',
    }, batch)

    expect(log).not.toHaveBeenCalled()
  })

  it('projects a coalesced summary to the selected binding only', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ filter: { include: { bindingIds: ['binding-a'] } } })
    const batch = { batchId: 1, transactionIds: [1, 2] }

    channel.debug('binding:set', {
      id: 'binding-a',
      keys: ['a'],
      managedPaths: ['a'],
      touched: ['a'],
      touchedPaths: ['a'],
      values: { a: 'visible' },
      options: {},
    }, { ...batch, bindingId: 'binding-a' })
    channel.debug('binding:set', {
      id: 'binding-a',
      keys: ['a'],
      managedPaths: ['a'],
      touched: ['a'],
      touchedPaths: ['a'],
      values: { a: 'visible' },
      options: {},
    }, { ...batch, bindingId: 'binding-a' })
    channel.debug('binding:set', {
      id: 'binding-b',
      keys: ['b'],
      managedPaths: ['b'],
      touched: ['b'],
      touchedPaths: ['b'],
      values: { b: 'private-to-b' },
      options: {},
    }, { ...batch, bindingId: 'binding-b' })
    channel.debug('gtq:flush', {
      paths: ['a', 'b'],
      query: { a: 'visible', b: 'private-to-b' },
      options: {},
    }, batch)
    channel.debug('adapter:commit', {
      query: { a: 'visible', b: 'private-to-b' },
      paths: ['a', 'b'],
      pendingPathCount: 2,
      source: 'write',
    }, batch)

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('[vuqs] Updated the URL: "a" = "visible".')
    expect(log.mock.calls[0]?.[0]).not.toContain('private-to-b')
    expect(log.mock.calls[0]?.[0]).not.toContain('b =')
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      data: {
        changes: { a: 'visible' },
        query: { a: 'visible' },
      },
    })
    expect((log.mock.calls[0]?.[1] as { data: { changes: object, query: object } }).data).not.toMatchObject({
      changes: { b: expect.anything() },
      query: { b: expect.anything() },
    })

    const removalBatch = { batchId: 2, transactionIds: [3, 4] }
    channel.debug('binding:set', {
      id: 'binding-a',
      keys: ['a'],
      managedPaths: ['a'],
      touched: ['a'],
      touchedPaths: ['a'],
      values: { a: null },
      options: {},
    }, { ...removalBatch, bindingId: 'binding-a' })
    channel.debug('gtq:flush', { paths: ['a', 'b'], query: { b: 'still-private' }, options: {} }, removalBatch)
    channel.debug('adapter:commit', {
      query: { b: 'still-private' },
      paths: ['a', 'b'],
      pendingPathCount: 2,
      source: 'write',
    }, removalBatch)

    expect(log.mock.calls[1]?.[0]).toBe('[vuqs] Removed "a" from the URL.')
    expect(log.mock.calls[1]?.[1]).toMatchObject({ data: { changes: { a: '[Removed]' }, query: {} } })
  })

  it('supports every selector dimension and rejects missing context dimensions', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({
      preset: 'trace',
      filter: {
        include: {
          levels: ['debug'],
          scopes: ['rd'],
          codes: ['rd:set'],
          runtimeIds: ['rt-console'],
          bindingIds: ['b'],
        },
      },
    })

    channel.debug('rd:set', { defaults: { q: 'x' } })
    channel.debug('rd:set', { defaults: { q: 'x' } }, { bindingId: 'b' })
    channel.warn('storage:error', { key: 'x', operation: 'save', error: null }, { bindingId: 'b' })

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain('rd:set')
  })

  it('uses lifecycle payloads as human trace labels without exposing ids in the message', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ preset: 'trace' })

    channel.debug('binding:created', {
      id: 'wide',
      keys: ['a', 'b', 'c', 'd', 'e'],
      managedPaths: ['a', 'b', 'c', 'd', 'e'],
    }, { bindingId: 'wide' })
    channel.debug('binding:disposed', {
      id: 'wide',
      keys: ['a', 'b', 'c', 'd', 'e'],
      managedPaths: ['a', 'b', 'c', 'd', 'e'],
    }, { bindingId: 'wide' })
    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs trace] binding:created — Created a query binding for "a", "b", "c", and 2 more parameters.',
      '[vuqs trace] binding:disposed — Disposed the query binding for "a", "b", "c", and 2 more parameters.',
    ])
  })

  it('escapes and bounds dynamic label lists in trace and summary', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const trace = withReporter({ preset: 'trace', previewLimits: { maxItems: 2 } })
    const exactTrace = withReporter({ preset: 'trace' })
    const zeroItems = withReporter({ preset: 'trace', previewLimits: { maxItems: 0 } })
    const summary = withReporter()
    const paths = ['quote"path', 'line\nbreak', 'third', 'fourth', 'fifth']

    trace.debug('binding:created', { id: 'wide', keys: paths, managedPaths: paths })
    summary.debug('adapter:commit', {
      query: {},
      paths,
      pendingPathCount: 0,
      source: 'external',
    })
    zeroItems.debug('binding:created', { id: 'zero', keys: paths, managedPaths: paths })
    exactTrace.debug('gtq:settle', { dropped: ['first', 'second', 'third'] })
    exactTrace.warn('storage:error', { key: 'filters', operation: 'save', error: null })

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs trace] binding:created — Created a query binding for "quote\\"path", "line\\nbreak", and 3 more parameters.')
    expect(log.mock.calls[1]?.[0]).toBe('[vuqs] The URL changed outside vuqs; synchronized "quote\\"path", "line\\nbreak", "third", and 2 more parameters.')
    expect(log.mock.calls[2]?.[0]).toBe('[vuqs trace] binding:created — Created a query binding for 5 parameters.')
    expect(log.mock.calls[3]?.[0]).toBe('[vuqs trace] gtq:settle — Removed committed paths from the optimistic state: "first", "second", and "third".')
    expect(warn.mock.calls[0]?.[0]).toBe('[vuqs trace] storage:error — Storage operation "save" failed for "filters".')
    expect(log.mock.calls.map(call => call[0]).join('')).not.toContain('line\nbreak')
  })

  it('escapes inline labels and preserves a real marker-shaped path', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const summary = withReporter()
    const trace = withReporter({ preset: 'trace' })
    const shortenedTrace = withReporter({ preset: 'trace', previewLimits: { maxStringLength: 9 } })
    const newline = 'line\nbreak'
    const quote = 'quote"path'
    const marker = '[+5 more]'

    emitCommittedWrite(summary, 1, [newline], { [newline]: 'x' })
    emitCommittedWrite(summary, 2, [newline, quote], { [newline]: 'x', [quote]: 'y' })
    summary.debug('rd:set', { defaults: { 'default\nkey': 'x' } })
    summary.debug('adapter:commit', { query: { [marker]: 'real' }, paths: [marker], pendingPathCount: 0, source: 'external' })
    trace.debug('binding:created', { id: 'marker', keys: [marker], managedPaths: [marker] })
    shortenedTrace.debug('binding:created', {
      id: 'literal-marker-after-shortened-label',
      keys: ['very-long-label', marker],
      managedPaths: ['very-long-label', marker],
    })

    expect(log.mock.calls.slice(0, 5).map(call => call[0])).toEqual([
      '[vuqs] Updated the URL: "line\\nbreak" = "x".',
      '[vuqs] Updated 2 URL parameters in one navigation: "line\\nbreak" = "x" and "quote\\"path" = "y".',
      '[vuqs] Set the runtime default: "default\\nkey" = "x".',
      '[vuqs] The URL changed outside vuqs; synchronized "[+5 more]".',
      '[vuqs trace] binding:created — Created a query binding for "[+5 more]".',
    ])
    expect(log.mock.calls[5]?.[0]).toContain('"[+5 more]"')
    expect(log.mock.calls[5]?.[0]).not.toContain('5 more parameters')
    expect(log.mock.calls.map(call => call[0]).join('')).not.toContain('\n')
  })

  it('distinguishes one-item truncation markers from real labels', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const trace = withReporter({ preset: 'trace', previewLimits: { maxItems: 2 } })
    const zeroItems = withReporter({ preset: 'trace', previewLimits: { maxItems: 0 } })
    const summary = withReporter({ previewLimits: { maxItems: 2 } })

    trace.debug('binding:created', { id: 'three', keys: ['a', 'b', 'c'], managedPaths: ['a', 'b', 'c'] })
    zeroItems.debug('binding:created', { id: 'one', keys: ['only'], managedPaths: ['only'] })
    summary.debug('adapter:commit', {
      query: {},
      paths: ['a', 'b', 'c'],
      pendingPathCount: 0,
      source: 'external',
    })
    summary.debug('ctx:change', { context: 'reviews', valid: [], invalid: ['a', 'b', 'c'] })

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs trace] binding:created — Created a query binding for "a", "b", and 1 more parameter.',
      '[vuqs trace] binding:created — Created a query binding for 1 parameter.',
      '[vuqs] The URL changed outside vuqs; synchronized "a", "b", and 1 more parameter.',
      '[vuqs] Changed the query context to "reviews"; "a", "b", and 1 more parameter are no longer valid.',
    ])
  })

  it('does not present object truncation sentinels as real fields', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const projected = withReporter({
      preset: 'trace',
      redact(preview, event) {
        const envelope = preview as { data?: Record<string, unknown> }
        if (event.code === 'rd:set') {
          return { ...envelope, data: { defaults: { 'a': 1, 'b': 2, '…': '[truncated]' } } }
        }
        if (event.code === 'gtq:enqueue') {
          return { ...envelope, data: { deltas: { 'a': 1, 'b': 2, '…': '[truncated]' }, pendingPathCount: 5 } }
        }
        if (event.code === 'serializer:build') {
          return { ...envelope, data: { query: { 'a': 1, 'b': 2, '…': '[truncated]' } } }
        }
        return preview
      },
    })
    const summary = withReporter({
      redact: preview => ({ ...(preview as object), data: { defaults: { 'a': 1, 'b': 2, '…': '[truncated]' } } }),
    })
    const literal = withReporter()
    const five = { a: 1, b: 2, c: 3, d: 4, e: 5 }

    projected.debug('rd:set', { defaults: five })
    projected.debug('gtq:enqueue', { deltas: five, pendingPathCount: 5 })
    projected.debug('serializer:build', { query: five })
    summary.debug('rd:set', { defaults: five })
    literal.debug('rd:set', { defaults: { '…': 'literal' } })

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs trace] rd:set — Set runtime defaults for "a", "b", and 3 more parameters.',
      '[vuqs trace] gtq:enqueue — Queued 5 URL changes; 5 paths are now pending.',
      '[vuqs trace] serializer:build — Built a query object with 5 top-level parameters.',
      '[vuqs] Set 5 runtime defaults: "a" = 1, "b" = 2, and 3 more defaults.',
      '[vuqs] Set the runtime default: "…" = "literal".',
    ])
    expect(log.mock.calls.slice(0, 4).map(call => call[0]).join('')).not.toContain('"…"')
  })
})

describe('console reporter: payload policy', () => {
  it('prints a stable preview rather than a live object reference', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ preset: 'trace' })
    const payload = { defaults: { q: 'clean' } }

    channel.debug('rd:set', payload)
    payload.defaults.q = 'mutated'

    expect(log.mock.calls[0]?.[1]).toMatchObject({ data: { defaults: { q: 'clean' } } })
    expect((log.mock.calls[0]?.[1] as { data: unknown }).data).not.toBe(payload)
  })

  it('redacts known sensitive keys and fails closed when a custom redactor throws', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const safe = withReporter({ preset: 'trace' })
    const hostile = JSON.parse('{"token":"secret","access_token":"also secret","__proto__":{"polluted":true},"visible":"ok"}') as Record<string, unknown>
    safe.debug('rd:set', { defaults: hostile })

    const closed = withReporter({
      preset: 'trace',
      redact: () => {
        throw new Error('boom')
      },
    })
    closed.debug('rd:set', { defaults: { visible: 'never exposed' } })

    const preview = log.mock.calls[0]?.[1] as { data: { defaults: Record<string, unknown> } }
    expect(preview).toMatchObject({
      data: {
        defaults: {
          token: '[Redacted]',
          access_token: '[Redacted]',
          visible: 'ok',
        },
      },
    })
    expect(Object.hasOwn(preview.data.defaults, '__proto__')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(preview.data.defaults, '__proto__')?.value).toEqual({ polluted: true })
    expect(Object.getPrototypeOf(preview.data.defaults)).toBe(Object.prototype)
    expect(log.mock.calls[1]?.[1]).toBe('[Preview unavailable]')
  })

  it('redacts parse failures whose semantic query path is sensitive', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channel = withReporter({ preset: 'trace' })

    channel.warn('engine:parse-miss', { path: 'token', raw: 'top-level secret' })
    channel.warn('engine:parse-miss', { path: 'auth.token', raw: 'nested secret' })
    channel.warn('engine:parse-miss', { path: 'page', raw: 'visible invalid value' })

    expect(warn.mock.calls.map(call => (call[1] as { data: { raw: string } }).data.raw)).toEqual([
      '[Redacted]',
      '[Redacted]',
      'visible invalid value',
    ])
  })

  it('builds dynamic summary and trace labels from redacted data', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const redact: ConsoleReporterOptions['redact'] = (preview, event) => {
      const envelope = preview as { data?: Record<string, unknown> }
      if (event.code === 'ctx:change') {
        return { ...envelope, data: { ...envelope.data, context: '[Redacted]', invalid: [] } }
      }
      if (event.code === 'storage:error') {
        return { ...envelope, data: { ...envelope.data, key: '[Redacted]' } }
      }
      if (event.code === 'adapter:error') {
        const raw = event.data as DebugEventMap['adapter:error']
        return raw.rolledBack === undefined
          ? { ...envelope, data: { error: null, rolledBack: [] } }
          : { ...envelope, data: { error: null } }
      }
      return preview
    }
    const summary = withReporter({ redact })
    const trace = withReporter({ preset: 'trace', redact })
    const hidden = withReporter({ payload: 'hidden', redact: () => null })
    const genericTrace = withReporter({ preset: 'trace', payload: 'hidden', redact: () => null })
    const partialTrace = withReporter({ preset: 'trace', payload: 'hidden', redact: () => ({ data: {} }) })

    summary.debug('ctx:change', { context: 'tenant-secret', valid: [], invalid: ['private-path'] })
    summary.warn('storage:error', { key: 'tenant-storage-secret', operation: 'save', error: null })
    summary.warn('adapter:error', { adapter: 'tenant-adapter-secret', error: null })
    summary.warn('adapter:error', { adapter: 'tenant-adapter-secret', error: null, rolledBack: ['tenant-path-secret'] })
    trace.debug('ctx:change', { context: 'tenant-secret', valid: [], invalid: ['private-path'] })
    hidden.debug('ctx:change', { context: 'hidden-tenant-secret', valid: [], invalid: [] })
    hidden.warn('engine:parse-miss', { path: 'hidden-query-secret', raw: 'bad' })
    hidden.warn('storage:error', { key: 'hidden-storage-error-secret', operation: 'load', error: null })
    hidden.debug('rd:reset', { context: 'hidden-context-secret' })
    hidden.debug('storage:restore', { key: 'hidden-storage-secret', outcome: 'restored' })
    genericTrace.debug('ctx:change', { context: 'trace-context-secret', valid: [], invalid: [] })
    partialTrace.warn('adapter:error', { adapter: 'partial-adapter-secret', error: null })

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Changed the query context to "[Redacted]".',
      '[vuqs trace] ctx:change — Changed the query context to "[Redacted]".',
      '[vuqs] Changed the query context.',
      '[vuqs] Cleared the runtime defaults after the query context changed.',
      '[vuqs] Applied saved query state from storage.',
      '[vuqs trace] ctx:change — Observed this debug event; its labels were hidden by the payload policy.',
    ])
    expect(warn.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Could not save "[Redacted]" to storage.',
      '[vuqs] The query adapter could not update the URL.',
      '[vuqs] Could not update the URL; restored 1 previous value.',
      '[vuqs] Ignored an invalid URL value for a query parameter because it could not be decoded.',
      '[vuqs] Could not load query state from storage.',
      '[vuqs trace] adapter:error — Observed this debug event; its labels were hidden by the payload policy.',
    ])
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/tenant-secret|private-path|hidden-tenant-secret|trace-context-secret/)
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/tenant-storage-secret|tenant-adapter-secret|tenant-path-secret|hidden-query-secret|hidden-storage-error-secret|partial-adapter-secret/)
    expect(log.mock.calls[2]).toHaveLength(1)
  })

  it('uses generic write prose when a redactor hides path labels', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const redact: ConsoleReporterOptions['redact'] = (preview, event) => {
      const envelope = preview as { data?: Record<string, unknown> }
      if (event.code !== 'adapter:commit') {
        return preview
      }
      return {
        ...envelope,
        data: { ...envelope.data, changes: {}, defaults: {} },
      }
    }
    const channel = withReporter({ redact })

    emitCommittedWrite(channel, 1, ['q'], { q: 'secret' }, { history: 'push' })
    emitCommittedWrite(channel, 2, ['q'], {})
    emitCommittedWrite(channel, 3, ['a', 'b'], { a: 1, b: 2 }, { history: 'push' })

    const defaultsContext = { batchId: 4, bindingId: 'page' }
    channel.debug('engine:clear-on-default', {
      id: 'page',
      keys: ['value'],
      key: 'value',
      paths: ['page'],
      defaultValue: 1,
    }, defaultsContext)
    channel.debug('gtq:flush', { paths: ['page'], query: {}, options: {} }, defaultsContext)
    channel.debug('adapter:commit', { query: {}, paths: ['page'], pendingPathCount: 1, source: 'write' }, defaultsContext)

    expect(log.mock.calls.map(call => call[0])).toEqual([
      '[vuqs] Updated the URL and added a browser history entry.',
      '[vuqs] Removed a URL parameter from the URL.',
      '[vuqs] Updated 2 URL parameters in one navigation and added a browser history entry.',
      '[vuqs] A query parameter now uses its default value, so it is not included in the URL.',
    ])
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/secret|"q"|"a"|"b"|"page"/)
  })

  it('applies semantic parse redaction to direct performance payloads too', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark)
    const channel = createDebugChannel('rt-performance-redaction')
    const reporter = createPerformanceReporter()
    disposers.push(channel.addReporter(reporter))

    channel.warn('engine:parse-miss', { path: 'credentials.apiKey', raw: 'secret' })

    expect(mark.mock.calls[0]?.[1]?.detail).toMatchObject({
      data: { path: 'credentials.apiKey', raw: '[Redacted]' },
    })
  })

  it('keeps correlation context on standalone summary events', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter()

    channel.debug('rd:set', { defaults: { q: 'x' } }, {
      bindingId: 'binding-q',
      transactionIds: [4],
      batchId: 9,
    })

    expect(log.mock.calls[0]?.[1]).toMatchObject({
      context: {
        runtimeId: 'rt-console',
        bindingId: 'binding-q',
        transactionIds: [4],
        batchId: 9,
      },
      data: { defaults: { q: 'x' } },
    })
  })

  it('supports explicit full and hidden payload modes', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const raw = { defaults: { q: 'raw' } }
    const full = withReporter({ preset: 'trace', payload: 'full' })
    full.debug('rd:set', raw)
    const hidden = withReporter({ preset: 'trace', payload: 'hidden' })
    hidden.debug('rd:clear')

    expect(log.mock.calls[0]?.[1]).toMatchObject({ data: raw })
    expect((log.mock.calls[0]?.[1] as { data: unknown }).data).toBe(raw)
    expect(log.mock.calls[1]).toHaveLength(1)
  })

  it('keeps raw module arguments only in explicit full mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const value = { q: 'raw' }
    const channel = withReporter({ payload: 'full' })

    channel.debug('module:log', { namespace: 'raw-module', message: 'value %O', values: [value] })

    expect(log).toHaveBeenCalledWith('[vuqs raw-module] value %O', value)
  })

  it('omits hidden module arguments and routes module warnings to console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channel = withReporter({ payload: 'hidden' })

    channel.warn('module:warn', { namespace: 'hidden-module', message: 'secret %s', values: ['value'] })

    expect(warn).toHaveBeenCalledWith('[vuqs hidden-module] secret %s')
  })

  it('keeps fallback binding context in details rather than the trace message', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    disposers.push(globalDebugChannel.addReporter(createConsoleReporter({ preset: 'trace' })))

    globalDebugChannel.debug('rd:set', { defaults: {} }, { bindingId: 'fallback' })

    expect(log.mock.calls[0]?.[0]).toBe('[vuqs trace] rd:set — Set an empty runtime-default layer.')
    expect(log.mock.calls[0]?.[1]).toMatchObject({ context: { bindingId: 'fallback' } })
  })

  it('clamps non-finite preview limits without exposing raw data', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ preset: 'trace', previewLimits: { maxDepth: Number.POSITIVE_INFINITY } })

    channel.debug('rd:set', { defaults: { nested: { q: 'x' } } })

    expect(log.mock.calls[0]?.[1]).not.toBeUndefined()
  })

  it('never creates User Timing marks as a side effect of console logging', () => {
    const mark = vi.spyOn(performance, 'mark')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const channel = withReporter({ preset: 'trace' })

    channel.debug('gtq:reset')

    expect(mark).not.toHaveBeenCalled()
  })
})

describe('performance reporter', () => {
  it('is opt-in, namespaced, contextual, bounded, and clearable', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark)
    const clearMarks = vi.spyOn(performance, 'clearMarks').mockImplementation(() => {})
    const reporter = createPerformanceReporter({ limit: 1 })
    const channel = createDebugChannel('rt-performance')
    disposers.push(channel.addReporter(reporter))

    channel.debug('gtq:reset')
    channel.debug('gtq:reset')

    expect(mark).toHaveBeenCalledTimes(2)
    expect(mark.mock.calls[0]?.[0]).toMatch(/^vuqs:r[0-9a-z]+:gtq:reset$/)
    expect(mark.mock.calls[0]?.[1]?.detail).toMatchObject({ scope: 'gtq', context: { runtimeId: 'rt-performance' } })
    expect(clearMarks).toHaveBeenCalledWith(mark.mock.calls[0]?.[0])

    reporter.clear()
    expect(clearMarks).toHaveBeenCalled()
  })

  it('uses disjoint mark names for coexisting reporters', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark)
    const clearMarks = vi.spyOn(performance, 'clearMarks').mockImplementation(() => {})
    const first = createPerformanceReporter({ limit: 1 })
    const second = createPerformanceReporter({ limit: 1 })
    const channel = createDebugChannel('rt-coexisting-performance')
    disposers.push(channel.addReporter(first), channel.addReporter(second))

    channel.debug('gtq:reset')
    const names = mark.mock.calls.map(call => call[0])
    expect(new Set(names).size).toBe(2)

    first.clear()
    expect(clearMarks).toHaveBeenCalledTimes(1)
    expect(clearMarks).toHaveBeenCalledWith(names[0])
  })

  it('is inert for a zero limit or unavailable User Timing', () => {
    const mark = vi.spyOn(performance, 'mark')
    const zero = createPerformanceReporter({ limit: 0 })
    const channel = createDebugChannel('rt-zero-performance')
    disposers.push(channel.addReporter(zero))
    channel.debug('gtq:reset')
    expect(mark).not.toHaveBeenCalled()

    vi.stubGlobal('performance', undefined)
    const unavailable = createPerformanceReporter({ limit: Number.POSITIVE_INFINITY })
    expect(() => unavailable.clear()).not.toThrow()
    const stop = channel.addReporter(unavailable)
    expect(() => channel.debug('gtq:reset')).not.toThrow()
    stop()
  })

  it('isolates mark failures and hosts without clearMarks', () => {
    const mark = vi.fn(() => {
      throw new Error('denied')
    })
    vi.stubGlobal('performance', { mark })
    const reporter = createPerformanceReporter()
    const channel = createDebugChannel('rt-hostile-performance')
    disposers.push(channel.addReporter(reporter))

    expect(() => channel.debug('gtq:reset')).not.toThrow()
    expect(() => reporter.clear()).not.toThrow()
    expect(mark).toHaveBeenCalled()
  })
})
