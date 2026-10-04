import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import { onScopeDispose, watch } from 'vue'
import { useQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { getDebugChannel } from '../../../src/core/diagnostics/bus'
import { getDebugSnapshot } from '../../../src/core/diagnostics/snapshot'
import { withTestQuery } from '../../helpers/adapter'

describe('withTestQuery', () => {
  it.each(['run', 'build'] as const)('disposes watchers and bindings created through %s', async (method) => {
    const fixture = withTestQuery({ q: 'initial' })
    const observed = vi.fn()
    const query = fixture[method](() => {
      const state = useQueryState('q')
      watch(state, observed, { flush: 'sync' })
      return state
    })
    const adapter = fixture.run(useQueryAdapter)!
    const channel = getDebugChannel(adapter)

    query.set('next')
    await Promise.resolve()
    expect(fixture.query.value).toEqual({ q: 'next' })
    expect(observed).toHaveBeenCalled()
    expect(getDebugSnapshot(channel).engines).toHaveLength(1)

    fixture.dispose()
    observed.mockClear()
    fixture.query.value = { q: 'external' }

    expect(observed).not.toHaveBeenCalled()
    expect(getDebugSnapshot(channel).engines).toEqual([])
  })

  it('disposes composed module scopes exactly once', () => {
    const fixture = withTestQuery()
    const disposed = vi.fn()
    fixture.build(() => useQueryStates({ q: codecs.string }).use(() => {
      onScopeDispose(disposed)
      return {}
    }))

    fixture.dispose()
    fixture.dispose()

    expect(disposed).toHaveBeenCalledOnce()
  })

  it.each(['run', 'build'] as const)('rejects %s after disposal without invoking the callback', (method) => {
    const fixture = withTestQuery()
    const create = vi.fn()
    fixture.dispose()

    expect(() => fixture[method](create)).toThrow('has been disposed')
    expect(create).not.toHaveBeenCalled()
  })

  it('discards a scheduled microtask write on the installed adapter', async () => {
    const fixture = withTestQuery({ q: 'initial' })
    const query = fixture.run(() => useQueryState('q'))
    query.set('pending')
    expect(query.value).toBe('pending')

    fixture.dispose()
    await Promise.resolve()

    expect(fixture.navigate).not.toHaveBeenCalled()
    expect(fixture.query.value).toEqual({ q: 'initial' })
    expect(query.value).toBe('initial')
  })

  it('discards a throttled write without affecting another fixture', async () => {
    vi.useFakeTimers()
    const first = withTestQuery({ q: 'first' })
    const second = withTestQuery({ q: 'second' })
    first.run(() => useQueryState('q', { throttleMs: 50 })).set('discarded')
    second.run(() => useQueryState('q', { throttleMs: 50 })).set('committed')

    first.dispose()
    await vi.advanceTimersByTimeAsync(50)

    expect(first.navigate).not.toHaveBeenCalled()
    expect(first.query.value).toEqual({ q: 'first' })
    expect(second.navigate).toHaveBeenCalledOnce()
    expect(second.query.value).toEqual({ q: 'committed' })
  })

  it('cleans up resources registered before a creation callback throws', () => {
    const fixture = withTestQuery()
    const disposed = vi.fn()

    expect(() => fixture.build(() => {
      useQueryState('q')
      onScopeDispose(disposed)
      throw new Error('creation failed')
    })).toThrow('creation failed')
    fixture.dispose()

    expect(disposed).toHaveBeenCalledOnce()
  })

  it('resets pending writes even when a scope disposer throws', async () => {
    const fixture = withTestQuery({ q: 'initial' })
    const query = fixture.run(() => {
      const state = useQueryState('q')
      onScopeDispose(() => {
        throw new Error('disposal failed')
      })
      return state
    })
    query.set('pending')

    expect(fixture.dispose).toThrow('disposal failed')
    await Promise.resolve()

    expect(fixture.navigate).not.toHaveBeenCalled()
    expect(fixture.query.value).toEqual({ q: 'initial' })
    expect(fixture.dispose).not.toThrow()
  })

  it('automatically disposes fixtures after a successful test', () => {
    const disposed = vi.fn()
    onTestFinished(() => {
      expect(disposed).toHaveBeenCalledOnce()
    })
    const fixture = withTestQuery()
    fixture.run(() => onScopeDispose(disposed))
  })

  describe('automatic cleanup after failure', () => {
    const disposed = vi.fn()

    afterAll(() => {
      expect(disposed).toHaveBeenCalledOnce()
    })

    it.fails('disposes the fixture when an assertion fails', () => {
      const fixture = withTestQuery()
      fixture.run(() => onScopeDispose(disposed))
      expect.unreachable('intentional assertion failure')
    })
  })
})
