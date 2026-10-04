import { describe, expect, it, vi } from 'vitest'
import { createDebugChannel } from '../../../src/core/diagnostics/bus'
import { createPerformanceReporter } from '../../../src/debug/performance-reporter'
import { track } from './helpers'

describe('performance reporter', () => {
  it('is opt-in, namespaced, contextual, bounded, and clearable', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark)
    const clearMarks = vi.spyOn(performance, 'clearMarks').mockImplementation(() => {})
    const reporter = createPerformanceReporter({ limit: 1 })
    const channel = createDebugChannel('rt-performance')
    track(channel.addReporter(reporter))

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
    track(channel.addReporter(first))
    track(channel.addReporter(second))

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
    track(channel.addReporter(zero))
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
    track(channel.addReporter(reporter))

    expect(() => channel.debug('gtq:reset')).not.toThrow()
    expect(() => reporter.clear()).not.toThrow()
    expect(mark).toHaveBeenCalled()
  })
})
