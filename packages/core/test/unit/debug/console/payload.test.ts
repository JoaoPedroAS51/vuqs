import type { DebugEventMap } from '../../../../src/core/diagnostics/events'
import type { ConsoleReporterOptions } from '../../../../src/debug/console-reporter'
import { describe, expect, it, vi } from 'vitest'
import { createDebugChannel, globalDebugChannel } from '../../../../src/core/diagnostics/bus'
import { createConsoleReporter } from '../../../../src/debug/console-reporter'
import { createPerformanceReporter } from '../../../../src/debug/performance-reporter'
import { emitCommittedWrite, track, withReporter } from '../helpers'

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
    track(channel.addReporter(reporter))

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
    track(globalDebugChannel.addReporter(createConsoleReporter({ preset: 'trace' })))

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
