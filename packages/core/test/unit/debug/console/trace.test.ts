import type { DebugEventCode, DebugEventMap, DebugScope } from '../../../../src/core/diagnostics/events'
import { describe, expect, it, vi } from 'vitest'
import { createConsoleReporter } from '../../../../src/debug/console-reporter'
import { DEBUG_EVENT_CATALOG, DEBUG_EVENT_ENTRIES } from '../../../../src/debug/event-catalog'

import { emitCommittedWrite, TRACE_PAYLOADS, withReporter } from '../helpers'

function formatCatalogTrace<Code extends DebugEventCode>(code: Code, data: DebugEventMap[Code]): string {
  return (DEBUG_EVENT_CATALOG[code].formatTrace as (payload: DebugEventMap[Code], raw: DebugEventMap[Code]) => string)(data, data)
}

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
