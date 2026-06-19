import type { ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, ref, watchEffect } from 'vue'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { addDebugReporter, getDebugChannel } from '../../src/core/debug/bus'
import { ThrottledQueue } from '../../src/core/queues/throttle'
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

  it('serializes async navigations so an older commit cannot land last', async () => {
    const query = ref<ParsedQuery>({})
    const commits: Array<() => void> = []
    const navigate = vi.fn((next: ParsedQueryRaw) => new Promise<void>((resolve) => {
      commits.push(() => {
        query.value = next
        resolve()
      })
    }))
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('first')
    await flush()
    q.set('second')
    await flush()

    expect(navigate).toHaveBeenCalledOnce()

    commits.shift()?.()
    await flush()
    expect(navigate).toHaveBeenCalledTimes(2)

    commits.shift()?.()
    await flush()
    expect(query.value).toEqual({ q: 'second' })
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

  it.each(['sync', 'async'] as const)('reconciles a successful %s no-op navigation without a query notification', async (kind) => {
    const query = ref<ParsedQuery>({ q: 'same' })
    const navigate = vi.fn(() => kind === 'async' ? Promise.resolve() : undefined)
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('same')
    await flush()
    expect(navigate).toHaveBeenCalledOnce()

    query.value = { q: 'external' }
    await flush()

    expect(q.value).toBe('external')
  })

  it('rolls back optimistic state when navigation fails', async () => {
    const query = ref<ParsedQuery>({})
    const app = createApp({})
    installQueryAdapter(app, {
      query,
      navigate: () => Promise.reject(new Error('blocked')),
    })
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('sale')
    expect(q.value).toBe('sale')
    await flush()

    expect(q.value).toBeUndefined()
    expect(query.value).toEqual({})
  })

  it('preserves a newer same-value write when an older navigation fails', async () => {
    const query = ref<ParsedQuery>({})
    let rejectFirst: ((error: Error) => void) | undefined
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      if (navigate.mock.calls.length === 1) {
        return new Promise<void>((_resolve, reject) => {
          rejectFirst = reject
        })
      }
      query.value = next
    })
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('same')
    await flush()
    q.set('same')
    await flush()
    rejectFirst?.(new Error('first failed'))
    await flush()

    expect(navigate).toHaveBeenCalledTimes(2)
    expect(query.value).toEqual({ q: 'same' })
    expect(q.value).toBe('same')
  })

  it('does not re-throttle a batch whose deadline elapsed behind a navigation', async () => {
    const query = ref<ParsedQuery>({})
    let finishFirst: (() => void) | undefined
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      if (navigate.mock.calls.length === 1) {
        return new Promise<void>((resolve) => {
          finishFirst = () => {
            query.value = next
            resolve()
          }
        })
      }
      query.value = next
    })
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })
    const first = app.runWithContext(() => useQueryState('first', codecs.string))
    const ready = app.runWithContext(() => useQueryState('ready', codecs.string))
    const late = app.runWithContext(() => useQueryState('late', codecs.string, { throttleMs: 100 }))

    first.set('a')
    await flush()
    ready.set('b')
    await flush()
    late.set('c')
    finishFirst?.()
    await flush()

    expect(navigate).toHaveBeenCalledTimes(2)
    expect(query.value).toEqual({ first: 'a', ready: 'b', late: 'c' })
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

  it('does not propagate unrelated query changes through consumed binding values', async () => {
    const { query, run } = setup()
    const scope = effectScope()
    const effects = { a: 0, b: 0 }

    scope.run(() => {
      const a = run(() => useQueryState('a', codecs.string))
      const b = run(() => useQueryState('b', codecs.string))
      watchEffect(() => {
        void a.value
        effects.a++
      })
      watchEffect(() => {
        void b.value
        effects.b++
      })
    })
    await nextTick()
    effects.a = 0
    effects.b = 0

    query.value = { a: 'changed' }
    await nextTick()

    expect(effects).toEqual({ a: 1, b: 0 })
    scope.stop()
  })

  it('releases the adapter observer after the last binding and pending path are gone', () => {
    const query = ref<ParsedQuery>({})
    const adapter = { query, navigate: vi.fn() }
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const commits: ParsedQuery[] = []
    const stopReporter = addDebugReporter((event) => {
      if (event.code === 'adapter:commit') {
        commits.push((event.data as { query: ParsedQuery }).query)
      }
    }, { channel: getDebugChannel(adapter) })

    const first = effectScope()
    first.run(() => app.runWithContext(() => useQueryState('q', codecs.string)))
    first.stop()
    query.value = { q: 'after-dispose' }
    expect(commits).toEqual([])

    const second = effectScope()
    second.run(() => app.runWithContext(() => useQueryState('q', codecs.string)))
    query.value = { q: 'after-remount' }
    expect(commits).toEqual([{ q: 'after-remount' }])

    second.stop()
    stopReporter()
  })

  it('reconciles a pending overlay after its originating engine unmounts', async () => {
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
    apply.forEach(fn => fn()) // the adapter-scoped queue still observes the commit

    // No replacement engine is needed to clean the overlay. A later external change is
    // adopted instead of being shadowed by a stale pending value.
    query.value = { q: 'phone' }
    const b = app.runWithContext(() => useQueryState('q', codecs.string))
    await flush()
    expect(b.value).toBe('phone')
  })

  it('never resurrects an unmounted binding\'s committed value on a later write', async () => {
    const query = ref<ParsedQuery>({ q: 'phone' })
    const apply: Array<() => void> = []
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      apply.push(() => {
        query.value = next
      })
    })
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })

    const first = effectScope()
    first.run(() => app.runWithContext(() => {
      useQueryState('q', codecs.string).set('sale')
    }))
    await flush()
    first.stop()
    apply.shift()?.() // commit q=sale after the binding is gone

    query.value = { q: 'external' }

    const second = effectScope()
    second.run(() => app.runWithContext(() => {
      useQueryState('page', codecs.integer).set(1)
    }))
    await flush()
    apply.shift()?.()

    expect(query.value).toEqual({ q: 'external', page: '1' })
    second.stop()
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

  it('isolates scheduled flushes between adapter identities', async () => {
    vi.useFakeTimers()

    try {
      const first = setup()
      first.run(() => useQueryState('q', codecs.string, { throttleMs: 50 })).set('a')

      const second = setup()
      second.run(() => useQueryState('q', codecs.string, { throttleMs: 50 })).set('b')

      await vi.advanceTimersByTimeAsync(50)

      expect(first.navigate).toHaveBeenCalledTimes(1)
      expect(first.query.value).toEqual({ q: 'a' })
      expect(second.navigate).toHaveBeenCalledTimes(1)
      expect(second.query.value).toEqual({ q: 'b' })
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('throttledQueue.settle', () => {
  it('makes binding ownership disposal idempotent', () => {
    const queue = new ThrottledQueue({ query: ref<ParsedQuery>({}), navigate: vi.fn() })
    const release = queue.retainBinding()

    release()
    expect(() => release()).not.toThrow()
  })

  it.each(['resolve', 'reject'] as const)('ignores a stale async %s after reset', async (outcome) => {
    let finish: (() => void) | undefined
    const navigation = new Promise<void>((resolve, reject) => {
      finish = () => outcome === 'resolve' ? resolve() : reject(new Error('stale'))
    })
    const adapter = { query: ref<ParsedQuery>({}), navigate: vi.fn(() => navigation) }
    const errors: unknown[] = []
    const stop = addDebugReporter((event) => {
      if (event.code === 'adapter:error') {
        errors.push(event.data)
      }
    }, { channel: getDebugChannel(adapter) })
    const queue = new ThrottledQueue(adapter)

    queue.push({ q: 'x' }, {}, 0)
    await flush()
    queue.reset()
    finish?.()
    await flush()

    expect(queue.overlay.value).toEqual({})
    expect(errors).toEqual([])
    stop()
  })

  it('handles an empty push and empty reset without starting overlay work', async () => {
    const navigate = vi.fn()
    const queue = new ThrottledQueue({ query: ref<ParsedQuery>({}), navigate })

    queue.push({}, {}, 0)
    queue.reset()
    await flush()

    expect(navigate).not.toHaveBeenCalled()
    expect(queue.overlay.value).toEqual({})
  })

  it('keeps one canonical overlay object across large write and settlement bursts', () => {
    const query = ref<ParsedQuery>({})
    const queue = new ThrottledQueue({ query, navigate: vi.fn() })
    const overlay = queue.overlay.value

    for (let index = 0; index < 200; index++) {
      queue.push({ [`p${index}`]: String(index) }, {}, 0)
      expect(queue.overlay.value).toBe(overlay)
    }

    queue.settle(Object.keys(overlay))

    expect(queue.overlay.value).toBe(overlay)
    expect(queue.overlay.value).toEqual({})
  })

  it('is a no-op for paths not present in the overlay', () => {
    const query = ref<ParsedQuery>({})
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      query.value = next
    })
    const queue = new ThrottledQueue({ query, navigate })

    queue.push({ q: 'x' }, {}, 0)
    const before = queue.overlay.value

    queue.settle(['never-pushed'])

    expect(queue.overlay.value).toBe(before)
  })

  it('skips a scheduled flush that settle already drained the overlay for', async () => {
    vi.useFakeTimers()

    try {
      const query = ref<ParsedQuery>({})
      const navigate = vi.fn((next: ParsedQueryRaw) => {
        query.value = next
      })
      const queue = new ThrottledQueue({ query, navigate })

      queue.push({ q: 'x' }, {}, 50)
      // A commit observed by the adapter runtime already reflects 'q', draining the
      // overlay before the scheduled flush fires.
      queue.settle(['q'])

      await vi.advanceTimersByTimeAsync(50)

      expect(navigate).not.toHaveBeenCalled()

      queue.push({ p: 'y' }, {}, 0)
      await vi.advanceTimersByTimeAsync(0)

      expect(navigate).toHaveBeenCalledWith({ p: 'y' }, {})
    }
    finally {
      vi.useRealTimers()
    }
  })
})
