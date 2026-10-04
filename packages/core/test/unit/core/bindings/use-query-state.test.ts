import { describe, expect, it } from 'vitest'
import { computed, isRef } from 'vue'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('useQueryState', () => {
  it('binds a single key as a writable ref', async () => {
    const { query, run } = setup({ q: 'phone' })
    const q = run(() => useQueryState('q', codecs.string))

    expect(q.value).toBe('phone')

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
    const { query, run } = setup({ q: 'phone' })
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
    const { query, run } = setup({ q: 'phone' })
    const q = run(() => useQueryState(queryParam('q', codecs.string)))

    expect(q.value).toBe('phone')

    q.value = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('binds a string with an implicit codec (no codec arg)', () => {
    const { run } = setup({ q: 'phone' })
    const q = run(() => useQueryState('q'))

    expect(q.value).toBe('phone')
  })

  it('applies a string defaultValue without a codec', () => {
    const { run } = setup()
    const q = run(() => useQueryState('q', { defaultValue: 'all' }))

    expect(q.value).toBe('all')
  })

  it('preserves ref identity and behavior when composing a single-state module', async () => {
    const { query, run } = setup({ q: 'phone' })
    const module = defineQueryModule({
      queryStates: () => ({ grouped: true }),
      queryState: (core, key) => ({
        selectedValue: computed(() => core.state.selected.value[key]),
      }),
    })
    const q = run(() => useQueryState('q', codecs.string))

    expect(isRef(q)).toBe(true)
    const used = q.use(module())

    expect(used).toBe(q)
    expect(isRef(q)).toBe(true)
    expect(q.value).toBe('phone')
    expect(used.selectedValue.value).toBe('phone')

    q.set('sale')
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
    expect(q.value).toBe('sale')

    q.clear()
    await flush()

    expect(query.value).toEqual({})
    expect(q.value).toBeUndefined()
  })

  it('composes a module for a composite param without replacing the ref', async () => {
    const { query, run } = setup({ from: '2026-01-01', to: '2026-01-31' })
    const range = queryParam.object({
      from: queryParam('from', codecs.string),
      to: queryParam('to', codecs.string),
    }).transform({
      read(value) {
        return value.from && value.to ? { from: value.from, to: value.to } : undefined
      },
      write: value => value,
    })
    const module = defineQueryModule({
      queryStates: () => ({}),
      queryState: (core, key) => ({
        currentValue: computed(() => core.state.values.value[key]),
      }),
    })
    const q = run(() => useQueryState(range))
    const used = q.use(module())

    expect(used).toBe(q)
    expect(used.currentValue.value).toEqual({ from: '2026-01-01', to: '2026-01-31' })

    q.value = { from: '2026-02-01', to: '2026-02-28' }
    await flush()

    expect(query.value).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(used.currentValue.value).toEqual({ from: '2026-02-01', to: '2026-02-28' })

    q.clear()
    await flush()

    expect(query.value).toEqual({})
  })
})
