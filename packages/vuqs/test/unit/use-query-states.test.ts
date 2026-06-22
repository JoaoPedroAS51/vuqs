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
    const states = useQueryStates(schema, { query, navigate })

    expect(states.q.value).toBe('lease')
    expect(states.sort.value).toBe('name')
  })

  it('updates the value optimistically before navigation flushes', () => {
    const { query, navigate } = setup()
    const states = useQueryStates(schema, { query, navigate })

    states.q.value = 'sale'

    expect(states.q.value).toBe('sale')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('writes to the URL on flush', async () => {
    const { query, navigate } = setup()
    const states = useQueryStates(schema, { query, navigate })

    states.q.value = 'sale'
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'sale' })
    expect(states.q.value).toBe('sale')
  })

  it('coalesces multiple writes in one tick into a single navigation', async () => {
    const { query, navigate } = setup()
    const states = useQueryStates(schema, { query, navigate })

    states.q.value = 'sale'
    states.sort.value = 'name'
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ q: 'sale', filters: { sort: 'name' } })
  })

  it('clears a field, removing it from the URL', async () => {
    const { query, navigate } = setup({ q: 'lease' })
    const states = useQueryStates(schema, { query, navigate })

    states.q.clear()
    await flush()

    expect(query.value).toEqual({})
    expect(states.q.value).toBeUndefined()
  })

  it('honors per-call navigation options', async () => {
    const { query, navigate } = setup()
    const states = useQueryStates(schema, { query, navigate, history: 'replace' })

    states.q.set('sale', { history: 'push' })
    await flush()

    expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))
  })

  it('forwards the scroll option', async () => {
    const { query, navigate } = setup()
    const states = useQueryStates(schema, { query, navigate })

    states.q.set('sale', { scroll: false })
    await flush()

    expect(navigate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scroll: false }))
  })

  it('keeps an in-flight write when an unrelated URL change occurs', async () => {
    const { query, navigate } = setup({ tab: 'a' })
    const states = useQueryStates(schema, { query, navigate })

    states.q.value = 'sale'
    query.value = { tab: 'b' }

    expect(states.q.value).toBe('sale')

    await flush()

    expect(query.value).toEqual({ tab: 'b', q: 'sale' })
  })

  it('preserves unmanaged params', async () => {
    const { query, navigate } = setup({ keep: 'me' })
    const states = useQueryStates(schema, { query, navigate })

    states.q.value = 'sale'
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
      const states = useQueryStates(withDefault, { query, navigate })

      states.page.value = 1
      await flush()

      expect(query.value).toEqual({})
      expect(states.page.value).toBe(1)
    })

    it('writes a non-default value', async () => {
      const { query, navigate } = setup()
      const states = useQueryStates(withDefault, { query, navigate })

      states.page.value = 2
      await flush()

      expect(query.value).toEqual({ page: '2' })
    })
  })

  describe('throttleMs', () => {
    it('coalesces writes within the throttle window', async () => {
      vi.useFakeTimers()
      const { query, navigate } = setup()
      const states = useQueryStates(schema, { query, navigate, throttleMs: 50 })

      states.q.value = 'a'
      states.q.value = 'b'
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
