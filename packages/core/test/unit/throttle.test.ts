import type { ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, ref } from 'vue'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { globalThrottleQueue, resetQueues } from '../../src/core/queues/throttle'
import { useQueryState } from '../../src/core/use-query-state'
import { withTestQuery as setup } from '../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// Models a real router whose query only updates after the navigation resolves,
// the condition under which per-engine commits used to race and clobber.
function setupAsync(initial: ParsedQuery = {}) {
  const query = ref<ParsedQuery>(initial)
  const navigate = vi.fn(async (next: ParsedQueryRaw) => {
    await Promise.resolve()
    query.value = next
  })
  const app = createApp({})
  installQueryAdapter(app, { query, navigate })
  const run = <T>(create: () => T): T => app.runWithContext(create)

  return { query, navigate, run }
}

describe('shared update queue', () => {
  it('syncs a write across engines bound to the same param before any flush', () => {
    const { run } = setup()
    const a = run(() => useQueryState('q', codecs.string))
    const b = run(() => useQueryState('q', codecs.string))

    a.set('x')

    expect(a.value).toBe('x')
    expect(b.value).toBe('x')
  })

  it('does not get stuck when two engines write the same param in one tick', async () => {
    const { query, navigate, run } = setup()
    const a = run(() => useQueryState('q', codecs.string))
    const b = run(() => useQueryState('q', codecs.string))

    a.set('x')
    b.set('y')

    // Last write wins for a shared param; the loser does not cling to a stale value.
    expect(a.value).toBe('y')
    expect(b.value).toBe('y')

    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'y' })
    expect(a.value).toBe('y')
  })

  it('coalesces writes from different engines into one navigation without clobbering', async () => {
    const { query, navigate, run } = setupAsync()
    const a = run(() => useQueryState('a', codecs.string))
    const b = run(() => useQueryState('b', codecs.string))

    a.set('1')
    b.set('2')

    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ a: '1', b: '2' })
  })

  it('reconciles the overlay away once the URL reflects the write', async () => {
    const { query, run } = setup()
    const q = run(() => useQueryState('q', codecs.string))

    q.set('x')
    await flush()

    expect(query.value).toEqual({ q: 'x' })
    expect(q.value).toBe('x')

    // An external URL change is now adopted (no stale overlay entry shadows it).
    query.value = { q: 'external' }
    await flush()

    expect(q.value).toBe('external')
  })

  it('keeps a pending write through an unrelated navigation until it commits', async () => {
    const { query, run } = setup({ other: 'keep' })
    const q = run(() => useQueryState('q', codecs.string))

    q.set('pending')
    // An unrelated navigation lands before our write commits.
    query.value = { other: 'changed' }

    expect(q.value).toBe('pending') // the optimistic write survives it

    await flush()

    // The commit merges the pending write onto the navigation that landed.
    expect(query.value).toEqual({ other: 'changed', q: 'pending' })
    expect(q.value).toBe('pending')
  })

  it('reconciles a stale overlay entry from an unmounted engine on the next mount', async () => {
    const query = ref<ParsedQuery>({ q: 'phone' })
    const apply: Array<() => void> = []
    // Defer the URL update so we can unmount the engine mid-navigation.
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      apply.push(() => {
        query.value = next
      })
    })
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })

    const scope = effectScope()
    scope.run(() => app.runWithContext(() => {
      useQueryState('q', codecs.string).set('sale')
    }))
    await flush() // navigate fired; the URL update is still pending

    scope.stop() // engine unmounts before the URL catches up
    apply.forEach(fn => fn()) // URL lands on 'sale' with no engine watching to settle it

    // A new engine mounts: its immediate reconcile settles the now-reflected entry.
    const b = app.runWithContext(() => useQueryState('q', codecs.string))
    expect(b.value).toBe('sale')

    // An external change is adopted, not shadowed by the leftover overlay entry.
    query.value = { q: 'phone' }
    await flush()
    expect(b.value).toBe('phone')
  })

  it('throttles writes within the window into one navigation', async () => {
    vi.useFakeTimers()

    try {
      const { query, navigate, run } = setup()
      const q = run(() => useQueryState('q', codecs.string, { throttleMs: 50 }))

      q.set('a')
      q.set('b')

      await vi.advanceTimersByTimeAsync(49)
      expect(navigate).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(navigate).toHaveBeenCalledTimes(1)
      expect(query.value).toEqual({ q: 'b' })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('does not let a flush scheduled before reset fire against the next adapter', async () => {
    vi.useFakeTimers()

    try {
      const first = setup()
      first.run(() => useQueryState('q', codecs.string, { throttleMs: 50 })).set('a')

      resetQueues() // the scheduled flush is now stale

      const second = setup()
      second.run(() => useQueryState('q', codecs.string, { throttleMs: 50 })).set('b')

      await vi.advanceTimersByTimeAsync(50)

      expect(first.navigate).not.toHaveBeenCalled()
      expect(second.navigate).toHaveBeenCalledTimes(1)
      expect(second.query.value).toEqual({ q: 'b' })
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('throttledQueue.settle', () => {
  it('is a no-op for paths not present in the overlay', () => {
    resetQueues()
    const query = ref<ParsedQuery>({})
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      query.value = next
    })

    globalThrottleQueue.push({ q: 'x' }, {}, { query, navigate }, 0)
    const before = globalThrottleQueue.overlay.value

    globalThrottleQueue.settle(['never-pushed'])

    expect(globalThrottleQueue.overlay.value).toBe(before)
  })

  it('skips a scheduled flush that settle already drained the overlay for', async () => {
    vi.useFakeTimers()

    try {
      resetQueues()
      const query = ref<ParsedQuery>({})
      const navigate = vi.fn((next: ParsedQueryRaw) => {
        query.value = next
      })

      globalThrottleQueue.push({ q: 'x' }, {}, { query, navigate }, 50)
      // Some other source (e.g. a different engine's reconcile) already
      // reflects 'q', draining the overlay before the scheduled flush fires.
      globalThrottleQueue.settle(['q'])

      await vi.advanceTimersByTimeAsync(50)

      expect(navigate).not.toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
