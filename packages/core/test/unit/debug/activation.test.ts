import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDebugReporter, createDebugChannel } from '../../../src/core/diagnostics/bus'
import { disableDebug, enableDebug } from '../../../src/debug'

import { resetDebugState, trackReporter } from '../../helpers/debug'

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

afterEach(resetDebugState)

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
    trackReporter(addDebugReporter(event => other.push(event.code)))

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
    const bus = await import('../../../src/core/diagnostics/bus')
    await import('../../../src/debug')
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

    const bus = await import('../../../src/core/diagnostics/bus')
    await import('../../../src/debug')
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

    const bus = await import('../../../src/core/diagnostics/bus')
    await import('../../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('server').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('does not auto-enable from the legacy debug key', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ debug: 'vuqs' }))

    const bus = await import('../../../src/core/diagnostics/bus')
    await import('../../../src/debug')
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

    const bus = await import('../../../src/core/diagnostics/bus')
    await import('../../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('browser-disabled').debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('warns once and stays disabled for an invalid stored configuration', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ 'vuqs:debug': '{' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const bus = await import('../../../src/core/diagnostics/bus')
    await import('../../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    bus.createDebugChannel('browser-invalid').debug('gtq:reset')

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('Ignored invalid "vuqs:debug" configuration')
    expect(log).not.toHaveBeenCalled()
  })
})
