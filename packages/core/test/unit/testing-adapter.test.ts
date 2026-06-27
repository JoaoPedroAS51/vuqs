import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createTestingAdapter, resetQueues, withVuqsTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('createTestingAdapter', () => {
  describe('searchParams parsing', () => {
    it('starts with an empty query when no searchParams are given', () => {
      const adapter = createTestingAdapter()

      expect(adapter.query.value).toEqual({})
    })

    it('parses a query string without a leading ?', () => {
      const adapter = createTestingAdapter({ searchParams: 'count=42&q=hello' })

      expect(adapter.query.value).toEqual({ count: '42', q: 'hello' })
    })

    it('parses a query string with a leading ?', () => {
      const adapter = createTestingAdapter({ searchParams: '?count=42' })

      expect(adapter.query.value).toEqual({ count: '42' })
    })

    it('parses a URLSearchParams instance', () => {
      const adapter = createTestingAdapter({ searchParams: new URLSearchParams('count=42') })

      expect(adapter.query.value).toEqual({ count: '42' })
    })

    it('parses a plain record', () => {
      const adapter = createTestingAdapter({ searchParams: { count: '42', q: 'hello' } })

      expect(adapter.query.value).toEqual({ count: '42', q: 'hello' })
    })

    it('collects repeated keys into an array', () => {
      const adapter = createTestingAdapter({ searchParams: 'tag=a&tag=b&tag=c' })

      expect(adapter.query.value).toEqual({ tag: ['a', 'b', 'c'] })
    })

    it('nests dot-notation keys from a query string', () => {
      const adapter = createTestingAdapter({ searchParams: '?filters.sort=name' })

      expect(adapter.query.value).toEqual({ filters: { sort: 'name' } })
    })

    it('nests dot-notation keys from a record', () => {
      const adapter = createTestingAdapter({ searchParams: { 'filters.sort': 'name' } })

      expect(adapter.query.value).toEqual({ filters: { sort: 'name' } })
    })

    it('accepts an already-nested query object', () => {
      const adapter = createTestingAdapter({ searchParams: { filters: { sort: 'name' } } })

      expect(adapter.query.value).toEqual({ filters: { sort: 'name' } })
    })

    it('exposes the initial nested value to a composable bound to a dot-path', () => {
      const adapter = createTestingAdapter({ searchParams: '?filters.sort=name' })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const sort = run(() => useQueryState('filters.sort', codecs.string))

      expect(sort.value).toBe('name')
    })
  })

  describe('hasMemory: false (default)', () => {
    it('does not update adapter.query.value when navigate is called', async () => {
      const adapter = createTestingAdapter({ searchParams: '?count=42' })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 99
      await flush()

      expect(adapter.query.value).toEqual({ count: '42' })
    })

    it('composable reads return the optimistic overlay value, not the frozen URL', async () => {
      // The optimistic overlay keeps the written value visible until the URL catches
      // up; without memory the URL never updates, so the overlay value persists.
      const adapter = createTestingAdapter({ searchParams: '?count=42' })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 99
      await flush()

      expect(adapter.query.value).toEqual({ count: '42' }) // URL is frozen
      expect(count.value).toBe(99) // composable sees the overlay
    })
  })

  describe('hasMemory: true', () => {
    it('updates adapter.query.value when navigate is called', async () => {
      const adapter = createTestingAdapter({ searchParams: '?count=42', hasMemory: true })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 99
      await flush()

      expect(adapter.query.value).toEqual({ count: '99' })
    })

    it('composable reads reflect writes after flush', async () => {
      const adapter = createTestingAdapter({ searchParams: '?count=42', hasMemory: true })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 99
      await flush()

      expect(count.value).toBe(99)
    })

    it('accumulates writes across multiple flushes', async () => {
      const adapter = createTestingAdapter({ hasMemory: true })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const schema = {
        q: queryParam('q', codecs.string),
        page: queryParam('page', codecs.integer),
      }
      const { values } = run(() => useQueryStates(schema))

      values.q = 'hello'
      await flush()
      values.page = 2
      await flush()

      expect(adapter.query.value).toEqual({ q: 'hello', page: '2' })
    })
  })

  describe('onUrlUpdate', () => {
    it('is called with the raw query and options on each navigate', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: '?count=42', onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 99
      await flush()

      expect(onUrlUpdate).toHaveBeenCalledOnce()
      const event = onUrlUpdate.mock.calls[0]![0]!
      expect(event.query).toEqual({ count: '99' })
      expect(event.options).toBeDefined()
    })

    it('passes the navigation options to the callback', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0), { history: 'replace' }))
      count.value = 1
      await flush()

      const event = onUrlUpdate.mock.calls[0]![0]!
      expect(event.options.history).toBe('replace')
    })

    it('is not called when no writes happen', async () => {
      const onUrlUpdate = vi.fn()
      createTestingAdapter({ onUrlUpdate })

      await flush()

      expect(onUrlUpdate).not.toHaveBeenCalled()
    })

    it('receives the full merged query, not just the delta', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: '?keep=me', onUrlUpdate, hasMemory: true })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 1
      await flush()

      const event = onUrlUpdate.mock.calls[0]![0]!
      expect(event.query).toEqual({ keep: 'me', count: '1' })
    })
  })

  describe('defaultOptions', () => {
    it('forwards defaultOptions to the adapter', () => {
      const adapter = createTestingAdapter({ defaultOptions: { history: 'push', throttleMs: 100 } })

      expect(adapter.defaultOptions).toEqual({ history: 'push', throttleMs: 100 })
    })

    it('leaves defaultOptions undefined when not provided', () => {
      const adapter = createTestingAdapter()

      expect(adapter.defaultOptions).toBeUndefined()
    })
  })

  describe('does not touch the global queue on creation', () => {
    it('leaves a pending write from another adapter intact', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 1
      // Do NOT flush yet

      // Creating another adapter must not reset the queue and drop the pending write
      createTestingAdapter()

      await flush()

      expect(onUrlUpdate).toHaveBeenCalledOnce()
    })
  })

  describe('composable integration', () => {
    it('composable reads the initial query correctly', () => {
      const adapter = createTestingAdapter({ searchParams: '?q=hello&count=5' })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const q = run(() => useQueryState('q', codecs.string))
      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))

      expect(q.value).toBe('hello')
      expect(count.value).toBe(5)
    })

    it('coalesces writes from multiple params into one navigate call', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const schema = {
        q: queryParam('q', codecs.string),
        page: queryParam('page', codecs.integer),
      }
      const { values } = run(() => useQueryStates(schema))

      values.q = 'hello'
      values.page = 2
      await flush()

      expect(onUrlUpdate).toHaveBeenCalledOnce()
    })
  })
})

describe('withVuqsTestingAdapter', () => {
  it('returns a function usable as a Vue plugin', () => {
    const plugin = withVuqsTestingAdapter()

    expect(typeof plugin).toBe('function')
  })

  it('installs a testing adapter on the app when called', () => {
    const plugin = withVuqsTestingAdapter({ searchParams: '?count=42' })
    const app = createApp({})
    plugin(app)
    const run = app.runWithContext.bind(app)

    const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))

    expect(count.value).toBe(42)
  })

  it('fires onUrlUpdate when the composable writes', async () => {
    const onUrlUpdate = vi.fn()
    const plugin = withVuqsTestingAdapter({ onUrlUpdate })
    const app = createApp({})
    plugin(app)
    const run = app.runWithContext.bind(app)

    const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
    count.value = 1
    await flush()

    expect(onUrlUpdate).toHaveBeenCalledOnce()
  })

  it('each plugin call creates an independent adapter', async () => {
    const onUrlUpdate1 = vi.fn()
    const onUrlUpdate2 = vi.fn()

    const plugin1 = withVuqsTestingAdapter({ onUrlUpdate: onUrlUpdate1 })
    const plugin2 = withVuqsTestingAdapter({ onUrlUpdate: onUrlUpdate2 })

    const app1 = createApp({})
    plugin1(app1)
    const run1 = app1.runWithContext.bind(app1)

    const app2 = createApp({})
    plugin2(app2)
    const run2 = app2.runWithContext.bind(app2)

    const count1 = run1(() => useQueryState('count', codecs.integer.withDefault(0)))
    const count2 = run2(() => useQueryState('count', codecs.integer.withDefault(0)))

    count1.value = 1
    await flush()

    expect(onUrlUpdate1).toHaveBeenCalledOnce()
    expect(onUrlUpdate2).not.toHaveBeenCalled()

    count2.value = 2
    await flush()

    expect(onUrlUpdate2).toHaveBeenCalledOnce()
  })
})

describe('resetQueues (re-export)', () => {
  it('clears the global queue so pending writes from a prior test do not leak', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ onUrlUpdate })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const run = app.runWithContext.bind(app)

    const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
    count.value = 1
    // Do NOT flush — write is pending

    resetQueues()
    await flush()

    expect(onUrlUpdate).not.toHaveBeenCalled()
  })
})
