import { describe, expect, it, vi } from 'vitest'
import { createConsoleReporter } from '../../../../src/debug/console-reporter'
import { emitCommittedWrite, TRACE_PAYLOADS, withReporter } from '../helpers'

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
