import type { ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function setup(initial: ParsedQuery = {}) {
  const query = ref<ParsedQuery>(initial)
  const navigate = vi.fn((next: ParsedQueryRaw) => {
    query.value = next
  })

  return { query, navigate }
}

const schema = {
  q: defineQueryState('q', codecs.string),
  sort: defineQueryState('filters.sort', codecs.string),
}

describe('useQueryStates', () => {
  it('reads field values from the query', () => {
    const { query, navigate } = setup({ q: 'lease', filters: { sort: 'name' } })
    const { values } = useQueryStates(schema, { query, navigate })

    expect(values.q).toBe('lease')
    expect(values.sort).toBe('name')
  })

  it('updates the value optimistically before navigation flushes', () => {
    const { query, navigate } = setup()
    const { values } = useQueryStates(schema, { query, navigate })

    values.q = 'sale'

    expect(values.q).toBe('sale')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('writes to the URL on flush', async () => {
    const { query, navigate } = setup()
    const { values } = useQueryStates(schema, { query, navigate })

    values.q = 'sale'
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'sale' })
    expect(values.q).toBe('sale')
  })

  it('coalesces multiple writes in one tick into a single navigation', async () => {
    const { query, navigate } = setup()
    const { values } = useQueryStates(schema, { query, navigate })

    values.q = 'sale'
    values.sort = 'name'
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'sale', filters: { sort: 'name' } })
  })

  it('clears a nullable field by assigning undefined', async () => {
    const { query, navigate } = setup({ q: 'lease' })
    const { values } = useQueryStates(schema, { query, navigate })

    values.q = undefined
    await flush()

    expect(query.value).toEqual({})
    expect(values.q).toBeUndefined()
  })

  describe('setValues', () => {
    it('sets several fields in a single navigation', async () => {
      const { query, navigate } = setup()
      const { setValues } = useQueryStates(schema, { query, navigate })

      setValues({ q: 'sale', sort: 'name' })
      await flush()

      expect(navigate).toHaveBeenCalledTimes(1)
      expect(query.value).toEqual({ q: 'sale', filters: { sort: 'name' } })
    })

    it('clears a field with null and skips an undefined field', async () => {
      const { query, navigate } = setup({ q: 'lease', filters: { sort: 'name' } })
      const { setValues } = useQueryStates(schema, { query, navigate })

      setValues({ q: null, sort: undefined })
      await flush()

      expect(query.value).toEqual({ filters: { sort: 'name' } })
    })

    it('ignores keys not in the schema, without crashing a later reconcile', async () => {
      const { query, navigate } = setup({ tab: 'a' })
      const { values, setValues } = useQueryStates(schema, { query, navigate })

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
      const { query, navigate } = setup()
      const { setValues } = useQueryStates(schema, { query, navigate, history: 'replace' })

      setValues({ q: 'sale' }, { history: 'push' })
      await flush()

      expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))
    })

    it('forwards the scroll option', async () => {
      const { query, navigate } = setup()
      const { setValues } = useQueryStates(schema, { query, navigate })

      setValues({ q: 'sale' }, { scroll: false })
      await flush()

      expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scroll: false }))
    })
  })

  it('clears every field', async () => {
    const { query, navigate } = setup({ q: 'lease', filters: { sort: 'name' }, keep: 'me' })
    const { clear } = useQueryStates(schema, { query, navigate })

    clear()
    await flush()

    expect(query.value).toEqual({ keep: 'me' })
  })

  it('keeps an in-flight write when an unrelated URL change occurs', async () => {
    const { query, navigate } = setup({ tab: 'a' })
    const { values } = useQueryStates(schema, { query, navigate })

    values.q = 'sale'
    query.value = { tab: 'b' }

    expect(values.q).toBe('sale')

    await flush()

    expect(query.value).toEqual({ tab: 'b', q: 'sale' })
  })

  it('preserves unmanaged params', async () => {
    const { query, navigate } = setup({ keep: 'me' })
    const { values } = useQueryStates(schema, { query, navigate })

    values.q = 'sale'
    await flush()

    expect(query.value).toEqual({ keep: 'me', q: 'sale' })
  })

  it('throws when two fields declare the same path', () => {
    const { query, navigate } = setup()
    const clashing = {
      a: defineQueryState('dupe', codecs.string),
      b: defineQueryState('dupe', codecs.string),
    }

    expect(() => useQueryStates(clashing, { query, navigate })).toThrowError(/duplicate query path/)
  })

  describe('clearOnDefault', () => {
    const withDefault = { page: defineQueryState('page', codecs.integer.withDefault(1)) }

    it('drops a value equal to the default from the URL', async () => {
      const { query, navigate } = setup({ page: '3' })
      const { values } = useQueryStates(withDefault, { query, navigate })

      values.page = 1
      await flush()

      expect(query.value).toEqual({})
      expect(values.page).toBe(1)
    })

    it('writes a non-default value', async () => {
      const { query, navigate } = setup()
      const { values } = useQueryStates(withDefault, { query, navigate })

      values.page = 2
      await flush()

      expect(query.value).toEqual({ page: '2' })
    })
  })

  describe('throttleMs', () => {
    it('coalesces writes within the throttle window', async () => {
      vi.useFakeTimers()
      const { query, navigate } = setup()
      const { values } = useQueryStates(schema, { query, navigate, throttleMs: 50 })

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
    const { query, navigate } = setup({ q: 'lease' })
    const q = useQueryState('q', codecs.string, { query, navigate })

    expect(q.value).toBe('lease')

    q.value = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('returns the default for a withDefault codec', () => {
    const { query, navigate } = setup()
    const page = useQueryState('page', codecs.integer.withDefault(1), { query, navigate })

    expect(page.value).toBe(1)
  })

  it('clears via set and clear', async () => {
    const { query, navigate } = setup({ q: 'lease' })
    const q = useQueryState('q', codecs.string, { query, navigate })

    q.clear()
    await flush()

    expect(query.value).toEqual({})
    expect(q.value).toBeUndefined()
  })

  it('honors per-call navigation options', async () => {
    const { query, navigate } = setup()
    const q = useQueryState('q', codecs.string, { query, navigate, history: 'replace' })

    q.set('sale', { history: 'push' })
    await flush()

    expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))
  })

  it('accepts a definition', async () => {
    const { query, navigate } = setup({ q: 'lease' })
    const q = useQueryState(defineQueryState('q', codecs.string), { query, navigate })

    expect(q.value).toBe('lease')

    q.value = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('binds a string with an implicit codec (no codec arg)', () => {
    const { query, navigate } = setup({ q: 'lease' })
    const q = useQueryState('q', { query, navigate })

    expect(q.value).toBe('lease')
  })

  it('applies a string defaultValue without a codec', () => {
    const { query, navigate } = setup()
    const q = useQueryState('q', { defaultValue: 'all', query, navigate })

    expect(q.value).toBe('all')
  })
})
