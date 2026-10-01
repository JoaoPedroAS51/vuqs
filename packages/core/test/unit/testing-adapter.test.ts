import { describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive, readonly } from 'vue'
import { createTestingAdapter, withVuqsTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('createTestingAdapter', () => {
  it.each([false, true])('applies navigation with hasMemory=%s', async (hasMemory) => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ searchParams: { q: 'old' }, hasMemory, onUrlUpdate })

    await adapter.navigate({ q: 'new' }, {})
    expect(adapter.query.value).toEqual({ q: hasMemory ? 'new' : 'old' })
    expect(onUrlUpdate).toHaveBeenCalledExactlyOnceWith({ query: { q: 'new' }, options: {} })
  })

  describe('searchParams parsing', () => {
    it.each(['plain', 'reactive', 'readonly'] as const)('copies %s query objects before reading their properties', (kind) => {
      const nested = reactive({ hasOwnProperty: 'nested' })
      const original = { hasOwnProperty: 'initial', filters: nested }
      const input = kind === 'plain' ? original : kind === 'reactive' ? reactive(original) : readonly(original)
      const adapter = createTestingAdapter({ searchParams: input })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const own = app.runWithContext(() => useQueryState('hasOwnProperty', codecs.string))
      const nestedOwn = app.runWithContext(() => useQueryState('filters.hasOwnProperty', codecs.string))

      expect(own.value).toBe('initial')
      expect(nestedOwn.value).toBe('nested')
      nested.hasOwnProperty = 'changed'
      expect(adapter.query.value).toEqual({ hasOwnProperty: 'initial', filters: { hasOwnProperty: 'nested' } })
    })

    it('copies arrays containing reactive objects without changing scalar values', () => {
      const rows = reactive([{ hasOwnProperty: 'row', tags: reactive(['a']) }])
      const input = reactive({ rows, zero: 0, enabled: false, blank: '', nil: null, absent: undefined })
      const adapter = createTestingAdapter({ searchParams: input })

      rows[0]!.hasOwnProperty = 'changed'
      rows[0]!.tags.push('b')
      rows.push({ hasOwnProperty: 'extra', tags: [] })

      expect(adapter.query.value).toEqual({
        rows: [{ hasOwnProperty: 'row', tags: ['a'] }],
        zero: 0,
        enabled: false,
        blank: '',
        nil: null,
        absent: undefined,
      })
    })

    it.each(['string', 'URLSearchParams'] as const)('preserves hasOwnProperty from %s input', (kind) => {
      const search = 'hasOwnProperty=initial&filters.hasOwnProperty=nested'
      const adapter = createTestingAdapter({ searchParams: kind === 'string' ? search : new URLSearchParams(search) })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const own = app.runWithContext(() => useQueryState('hasOwnProperty', codecs.string))
      const nested = app.runWithContext(() => useQueryState('filters.hasOwnProperty', codecs.string))

      expect(own.value).toBe('initial')
      expect(nested.value).toBe('nested')
    })

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

  describe.each([false, true])('query snapshots with hasMemory=%s', (hasMemory) => {
    it('records a copied navigation query with reactive values', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: { hasOwnProperty: 'initial' }, hasMemory, onUrlUpdate })
      const next = reactive({ hasOwnProperty: 'next', rows: reactive([{ hasOwnProperty: 'row' }]) })

      await adapter.navigate(next, { history: 'push' })
      next.hasOwnProperty = 'changed'
      next.rows[0]!.hasOwnProperty = 'changed'

      expect(onUrlUpdate).toHaveBeenCalledExactlyOnceWith({
        query: { hasOwnProperty: 'next', rows: [{ hasOwnProperty: 'row' }] },
        options: { history: 'push' },
      })
      expect(adapter.query.value).toEqual(hasMemory
        ? { hasOwnProperty: 'next', rows: [{ hasOwnProperty: 'row' }] }
        : { hasOwnProperty: 'initial' })
    })

    it('updates composables when the query is replaced instead of mutated', async () => {
      const adapter = createTestingAdapter({ searchParams: { q: 'initial', filters: { sort: 'initial' }, tags: ['a'] }, hasMemory })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const q = app.runWithContext(() => useQueryState('q', codecs.string))
      const sort = app.runWithContext(() => useQueryState('filters.sort', codecs.string))
      const tags = app.runWithContext(() => useQueryState('tags', codecs.arrayOf(codecs.string)))

      expect(q.value).toBe('initial')
      expect(sort.value).toBe('initial')
      expect(tags.value).toEqual(['a'])
      const filters = adapter.query.value.filters as { sort: string }
      const currentTags = adapter.query.value.tags as string[]
      adapter.query.value.q = 'mutated'
      filters.sort = 'mutated'
      currentTags.push('b')
      await nextTick()

      expect(q.value).toBe('initial')
      expect(sort.value).toBe('initial')
      expect(tags.value).toEqual(['a'])
      adapter.query.value = { q: 'replaced', filters: { sort: 'replaced' }, tags: ['c'] }
      await nextTick()

      expect(q.value).toBe('replaced')
      expect(sort.value).toBe('replaced')
      expect(tags.value).toEqual(['c'])
    })
  })

  describe('hasMemory: false (default)', () => {
    it.each(['toString', 'valueOf', 'toLocaleString'])('supports the query path %s', async (path) => {
      const adapter = createTestingAdapter({ searchParams: { [path]: 'initial' } })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const state = app.runWithContext(() => useQueryState(path, codecs.string))

      expect(state.value).toBe('initial')
      state.set('changed')
      await flush()
      expect(state.value).toBe('changed')
      state.clear()
      await flush()
      expect(state.value).toBeUndefined()
      expect(adapter.query.value).toEqual({ [path]: 'initial' })
    })

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

    it('keeps completed writes visible without changing the frozen query', async () => {
      const adapter = createTestingAdapter({ searchParams: '?count=42' })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
      count.value = 99
      await flush()

      expect(adapter.query.value).toEqual({ count: '42' })
      expect(count.value).toBe(99)
    })

    it('coalesces one batch without carrying it into the next navigation', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: { keep: 'initial' }, onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const { values } = app.runWithContext(() => useQueryStates({ q: codecs.string, page: codecs.integer, sort: codecs.string }))

      values.q = 'search'
      values.page = 2
      await flush()
      values.sort = 'name'
      await flush()

      expect(onUrlUpdate.mock.calls.map(([event]) => event.query)).toEqual([
        { keep: 'initial', q: 'search', page: '2' },
        { keep: 'initial', sort: 'name' },
      ])
      expect(values.q).toBe('search')
      expect(values.page).toBe(2)
      expect(values.sort).toBe('name')
    })

    it('shares simulated values between bindings without replaying their completed writes', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const first = app.runWithContext(() => useQueryState('q', codecs.string))

      first.set('search')
      await flush()
      const second = app.runWithContext(() => useQueryState('q', codecs.string))
      const page = app.runWithContext(() => useQueryState('page', codecs.integer))
      expect(second.value).toBe('search')

      page.set(2)
      await flush()

      expect(onUrlUpdate).toHaveBeenLastCalledWith({ query: { page: '2' }, options: expect.anything() })
      expect(first.value).toBe('search')
      expect(second.value).toBe('search')
    })

    it('preserves nested siblings in the initial base after a simulated removal', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: { filters: { sort: 'initial', category: 'keep' } }, onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const sort = app.runWithContext(() => useQueryState('filters.sort', codecs.string))
      const category = app.runWithContext(() => useQueryState('filters.category', codecs.string))

      sort.clear()
      await flush()
      category.set('changed')
      await flush()

      expect(onUrlUpdate.mock.calls.map(([event]) => event.query)).toEqual([
        { filters: { category: 'keep' } },
        { filters: { sort: 'initial', category: 'changed' } },
      ])
      expect(sort.value).toBeUndefined()
      expect(category.value).toBe('changed')
      expect(adapter.query.value).toEqual({ filters: { sort: 'initial', category: 'keep' } })
    })

    it('restores the last simulated value when a later navigation throws', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: { q: 'initial' }, onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const q = app.runWithContext(() => useQueryState('q', codecs.string))

      q.set('completed')
      await flush()
      onUrlUpdate.mockImplementationOnce(() => {
        throw new Error('blocked')
      })
      q.set('failed')
      await flush()

      expect(q.value).toBe('completed')
      const page = app.runWithContext(() => useQueryState('page', codecs.integer))
      page.set(2)
      await flush()

      expect(onUrlUpdate).toHaveBeenLastCalledWith({ query: { q: 'initial', page: '2' }, options: expect.anything() })
      expect(q.value).toBe('completed')
    })

    it('preserves a write made during the previous navigation callback', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const q = app.runWithContext(() => useQueryState('q', codecs.string))
      onUrlUpdate.mockImplementationOnce(() => q.set('newer'))

      q.set('first')
      await flush()

      expect(onUrlUpdate.mock.calls.map(([event]) => event.query)).toEqual([{ q: 'first' }, { q: 'newer' }])
      expect(q.value).toBe('newer')
      expect(adapter.query.value).toEqual({})
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

  describe.each([false, true])('navigation history with hasMemory=%s', (hasMemory) => {
    it('uses the configured query base across separate flushes', async () => {
      const onUrlUpdate = vi.fn()
      const initial = { q: 'initial', keep: 'untouched' }
      const adapter = createTestingAdapter({ searchParams: initial, hasMemory, onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const { values } = app.runWithContext(() => useQueryStates({ q: codecs.string, page: codecs.integer }))

      values.q = 'changed'
      await flush()
      values.page = 2
      await flush()

      expect(onUrlUpdate).toHaveBeenCalledTimes(2)
      expect(onUrlUpdate.mock.calls.map(([event]) => event.query)).toEqual([
        { q: 'changed', keep: 'untouched' },
        { q: hasMemory ? 'changed' : 'initial', keep: 'untouched', page: '2' },
      ])
      expect(adapter.query.value).toEqual(hasMemory ? { q: 'changed', keep: 'untouched', page: '2' } : initial)
      expect(values.q).toBe('changed')
      expect(values.page).toBe(2)
      adapter.resetQueue()
    })

    it('uses the configured query base after clearing a param', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ searchParams: { q: 'initial', keep: 'untouched' }, hasMemory, onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const q = app.runWithContext(() => useQueryState('q', codecs.string))
      const page = app.runWithContext(() => useQueryState('page', codecs.integer))

      q.clear()
      await flush()
      page.set(2)
      await flush()

      expect(onUrlUpdate.mock.calls.map(([event]) => event.query)).toEqual([
        { keep: 'untouched' },
        hasMemory ? { keep: 'untouched', page: '2' } : { q: 'initial', keep: 'untouched', page: '2' },
      ])
      expect(q.value).toBeUndefined()
      expect(page.value).toBe(2)
      adapter.resetQueue()
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
      // Leave the write pending.

      // Creating another adapter must not reset the queue and drop the pending write
      createTestingAdapter()

      await flush()

      expect(onUrlUpdate).toHaveBeenCalledOnce()
    })
  })

  describe('composable integration', () => {
    it('reads the initial query into the composable', () => {
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

describe('resetQueue', () => {
  it('clears simulated values along with pending writes without memory', async () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'initial' } })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))
    const page = app.runWithContext(() => useQueryState('page', codecs.integer))

    q.set('simulated')
    await flush()
    page.set(2)
    adapter.resetQueue()
    await flush()

    expect(q.value).toBe('initial')
    expect(page.value).toBeUndefined()
    expect(adapter.query.value).toEqual({ q: 'initial' })
  })

  it('does not retain a simulated attempt that was reset during its callback', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ searchParams: { q: 'initial' }, onUrlUpdate })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))
    onUrlUpdate.mockImplementationOnce(() => {
      adapter.resetQueue()
      q.set('newer')
    })

    q.set('stale')
    await flush()

    expect(onUrlUpdate.mock.calls.map(([event]) => event.query)).toEqual([{ q: 'stale' }, { q: 'newer' }])
    expect(q.value).toBe('newer')
    expect(adapter.query.value).toEqual({ q: 'initial' })
  })

  it('clears only this adapter queue so a pending write cannot flush', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ onUrlUpdate })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const run = app.runWithContext.bind(app)

    const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
    count.value = 1
    // Leave the write pending.

    adapter.resetQueue()
    await flush()

    expect(onUrlUpdate).not.toHaveBeenCalled()

    count.value = 2
    await flush()
    expect(onUrlUpdate).toHaveBeenCalledOnce()
  })

  it('is a no-op before the adapter runtime has been created', () => {
    const adapter = createTestingAdapter()

    expect(() => adapter.resetQueue()).not.toThrow()
  })
})
