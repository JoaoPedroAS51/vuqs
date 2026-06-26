import type { ParsedQuery } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { defineQueryParam } from '../../src/core/define-query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// Provides the adapter through app-level inject, so composables resolve
// `query`/`navigate` the way they do in a real app. `run` wraps composable
// creation in the adapter's injection context. `hasMemory` mirrors a real
// adapter, writing each navigation back to the query a `navigate` spy wraps.
function setup(initial: ParsedQuery = {}) {
  const adapter = createTestingAdapter({ searchParams: initial, hasMemory: true })
  const { query } = adapter
  const navigate = vi.fn(adapter.navigate)
  const app = createApp({})
  installQueryAdapter(app, { query, navigate })
  const run = <T>(create: () => T): T => app.runWithContext(create)

  return { query, navigate, run }
}

const schema = {
  q: defineQueryParam('q', codecs.string),
  sort: defineQueryParam('filters.sort', codecs.string),
}

describe('useQueryStates', () => {
  it('reads field values from the query', () => {
    const { run } = setup({ q: 'lease', filters: { sort: 'name' } })
    const { values } = run(() => useQueryStates(schema))

    expect(values.q).toBe('lease')
    expect(values.sort).toBe('name')
  })

  it('updates the value optimistically before navigation flushes', () => {
    const { navigate, run } = setup()
    const { values } = run(() => useQueryStates(schema))

    values.q = 'sale'

    expect(values.q).toBe('sale')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('writes to the URL on flush', async () => {
    const { query, navigate, run } = setup()
    const { values } = run(() => useQueryStates(schema))

    values.q = 'sale'
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'sale' })
    expect(values.q).toBe('sale')
  })

  it('coalesces multiple writes in one tick into a single navigation', async () => {
    const { query, navigate, run } = setup()
    const { values } = run(() => useQueryStates(schema))

    values.q = 'sale'
    values.sort = 'name'
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'sale', filters: { sort: 'name' } })
  })

  it('clears a nullable field by assigning undefined', async () => {
    const { query, run } = setup({ q: 'lease' })
    const { values } = run(() => useQueryStates(schema))

    values.q = undefined
    await flush()

    expect(query.value).toEqual({})
    expect(values.q).toBeUndefined()
  })

  describe('setValues', () => {
    it('sets several fields in a single navigation', async () => {
      const { query, navigate, run } = setup()
      const { setValues } = run(() => useQueryStates(schema))

      setValues({ q: 'sale', sort: 'name' })
      await flush()

      expect(navigate).toHaveBeenCalledTimes(1)
      expect(query.value).toEqual({ q: 'sale', filters: { sort: 'name' } })
    })

    it('clears a field with null and skips an undefined field', async () => {
      const { query, run } = setup({ q: 'lease', filters: { sort: 'name' } })
      const { setValues } = run(() => useQueryStates(schema))

      setValues({ q: null, sort: undefined })
      await flush()

      expect(query.value).toEqual({ filters: { sort: 'name' } })
    })

    it('ignores keys not in the schema, without crashing a later reconcile', async () => {
      const { query, run } = setup({ tab: 'a' })
      const { values, setValues } = run(() => useQueryStates(schema))

      // @ts-expect-error a runtime caller may pass a foreign key
      setValues({ q: 'x', nope: 'y' })
      await flush()

      expect(query.value).toEqual({ tab: 'a', q: 'x' })
      expect(values.q).toBe('x')

      // an unrelated URL change must not throw in the reconcile watcher
      query.value = { tab: 'b', q: 'x' }
      await flush()

      expect(values.q).toBe('x')
    })

    it('honors per-call navigation options', async () => {
      const { navigate, run } = setup()
      const { setValues } = run(() => useQueryStates(schema, { history: 'replace' }))

      setValues({ q: 'sale' }, { history: 'push' })
      await flush()

      expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))
    })

    it('forwards the scroll option', async () => {
      const { navigate, run } = setup()
      const { setValues } = run(() => useQueryStates(schema))

      setValues({ q: 'sale' }, { scroll: false })
      await flush()

      expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scroll: false }))
    })
  })

  it('clears every field', async () => {
    const { query, run } = setup({ q: 'lease', filters: { sort: 'name' }, keep: 'me' })
    const { clear } = run(() => useQueryStates(schema))

    clear()
    await flush()

    expect(query.value).toEqual({ keep: 'me' })
  })

  it('keeps an in-flight write when an unrelated URL change occurs', async () => {
    const { query, run } = setup({ tab: 'a' })
    const { values } = run(() => useQueryStates(schema))

    values.q = 'sale'
    query.value = { tab: 'b' }

    expect(values.q).toBe('sale')

    await flush()

    expect(query.value).toEqual({ tab: 'b', q: 'sale' })
  })

  it('preserves unmanaged params', async () => {
    const { query, run } = setup({ keep: 'me' })
    const { values } = run(() => useQueryStates(schema))

    values.q = 'sale'
    await flush()

    expect(query.value).toEqual({ keep: 'me', q: 'sale' })
  })

  it('throws when two fields declare the same path', () => {
    const { run } = setup()
    const clashing = {
      a: defineQueryParam('dupe', codecs.string),
      b: defineQueryParam('dupe', codecs.string),
    }

    expect(() => run(() => useQueryStates(clashing))).toThrowError(/duplicate query path/)
  })

  it('throws when no adapter is provided', () => {
    expect(() => useQueryStates(schema)).toThrowError(/no query adapter/)
  })

  describe('clearOnDefault', () => {
    const withDefault = { page: defineQueryParam('page', codecs.integer.withDefault(1)) }

    it('drops a value equal to the default from the URL', async () => {
      const { query, run } = setup({ page: '3' })
      const { values } = run(() => useQueryStates(withDefault))

      values.page = 1
      await flush()

      expect(query.value).toEqual({})
      expect(values.page).toBe(1)
    })

    it('writes a non-default value', async () => {
      const { query, run } = setup()
      const { values } = run(() => useQueryStates(withDefault))

      values.page = 2
      await flush()

      expect(query.value).toEqual({ page: '2' })
    })
  })

  describe('throttleMs', () => {
    it('coalesces writes within the throttle window', async () => {
      vi.useFakeTimers()
      const { query, navigate, run } = setup()
      const { values } = run(() => useQueryStates(schema, { throttleMs: 50 }))

      values.q = 'a'
      values.q = 'b'
      await vi.advanceTimersByTimeAsync(49)
      expect(navigate).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(navigate).toHaveBeenCalledTimes(1)
      expect(query.value).toEqual({ q: 'b' })

      vi.useRealTimers()
    })
  })
})

describe('useQueryState', () => {
  it('binds a single key as a writable ref', async () => {
    const { query, run } = setup({ q: 'lease' })
    const q = run(() => useQueryState('q', codecs.string))

    expect(q.value).toBe('lease')

    q.value = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('returns the default for a withDefault codec', () => {
    const { run } = setup()
    const page = run(() => useQueryState('page', codecs.integer.withDefault(1)))

    expect(page.value).toBe(1)
  })

  it('clears via set and clear', async () => {
    const { query, run } = setup({ q: 'lease' })
    const q = run(() => useQueryState('q', codecs.string))

    q.clear()
    await flush()

    expect(query.value).toEqual({})
    expect(q.value).toBeUndefined()
  })

  it('honors per-call navigation options', async () => {
    const { navigate, run } = setup()
    const q = run(() => useQueryState('q', codecs.string, { history: 'replace' }))

    q.set('sale', { history: 'push' })
    await flush()

    expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))
  })

  it('accepts a definition', async () => {
    const { query, run } = setup({ q: 'lease' })
    const q = run(() => useQueryState(defineQueryParam('q', codecs.string)))

    expect(q.value).toBe('lease')

    q.value = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('binds a string with an implicit codec (no codec arg)', () => {
    const { run } = setup({ q: 'lease' })
    const q = run(() => useQueryState('q'))

    expect(q.value).toBe('lease')
  })

  it('applies a string defaultValue without a codec', () => {
    const { run } = setup()
    const q = run(() => useQueryState('q', { defaultValue: 'all' }))

    expect(q.value).toBe('all')
  })
})
