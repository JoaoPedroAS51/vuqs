import { describe, expect, it } from 'vitest'
import { isRef } from 'vue'
import { codecs } from '../../../../src/core/codec'
import { queryParam } from '../../../../src/core/query-param'
import { useQueryState } from '../../../../src/core/use-query-state'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { withRuntimeDefaults } from '../../../../src/modules/runtime-defaults'
import { withTestQuery as setup } from '../../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('withRuntimeDefaults', () => {
  const schema = {
    currency: queryParam('currency', codecs.string),
    region: queryParam('region', codecs.string),
  }

  it('separates selected, defaults, and resolved values', () => {
    const { build } = setup({ currency: 'EUR' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    q.setDefaults({ currency: 'USD', region: 'us' })

    expect(q.selected).toEqual({ currency: 'EUR' })
    expect(q.defaults).toEqual({ currency: 'USD', region: 'us' })
    expect(q.values).toEqual({ currency: 'EUR', region: 'us' })
  })

  it('falls back to the default in values when a field is cleared', async () => {
    const { build } = setup({ currency: 'EUR' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ currency: 'USD' })

    q.values.currency = undefined
    await flush()

    expect(q.selected).toEqual({})
    expect(q.values).toEqual({ currency: 'USD' })
  })

  it('clears provided defaults', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    q.setDefaults({ currency: 'USD' })
    q.clearDefaults()

    expect(q.values).toEqual({})
  })

  it('adds runtime defaults to a single ref without replacing it', async () => {
    const { query, build } = setup({ currency: 'EUR' })
    const currency = build(() => useQueryState('currency', codecs.string))

    const used = currency.use(withRuntimeDefaults())
    used.setDefault('USD')

    expect(used).toBe(currency)
    expect(isRef(currency)).toBe(true)
    expect(currency.value).toBe('EUR')
    expect(used.selectedValue.value).toBe('EUR')
    expect(used.defaultValue.value).toBe('USD')

    currency.clear()
    await flush()

    expect(query.value).toEqual({})
    expect(currency.value).toBe('USD')
    expect(used.selectedValue.value).toBeUndefined()

    used.clearDefault()

    expect(currency.value).toBeUndefined()
    expect(used.defaultValue.value).toBeUndefined()
  })

  it('keeps single runtime defaults coherent with clearOnDefault', async () => {
    const { query, build } = setup()
    const page = build(() => useQueryState('page', codecs.integer.withDefault(1)).use(withRuntimeDefaults()))

    page.setDefault(5)
    page.value = 1
    await flush()

    expect(query.value).toEqual({ page: '1' })
    expect(page.selectedValue.value).toBe(1)
    expect(page.value).toBe(1)

    page.value = 5
    await flush()

    expect(query.value).toEqual({})
    expect(page.selectedValue.value).toBeUndefined()
    expect(page.value).toBe(5)
  })

  it('supports a single composite param without creating a parallel ref', () => {
    const { build } = setup({ from: '2026-01-01', to: '2026-01-31' })
    const rangeParam = queryParam.object({
      from: queryParam('from', codecs.string),
      to: queryParam('to', codecs.string),
    }).transform({
      read(value) {
        return value.from && value.to ? { from: value.from, to: value.to } : undefined
      },
      write: value => value,
    })
    const range = build(() => useQueryState(rangeParam))
    const used = range.use(withRuntimeDefaults())

    used.setDefault({ from: '2026-02-01', to: '2026-02-28' })

    expect(used).toBe(range)
    expect(range.value).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(used.selectedValue.value).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(used.defaultValue.value).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('withRuntimeDefaults + codec defaults', () => {
  const schema = {
    q: queryParam('q', codecs.string),
    page: queryParam('page', codecs.integer.withDefault(1)),
  }

  it('uses the codec default as the lowest fallback, keeping selected explicit', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({}) // explicit only — no codec default here
    expect(q.defaults).toEqual({ page: 1 }) // codec default
    expect(q.values).toEqual({ page: 1 }) // falls through to the codec default
    expect(q.values.page).toBe(1) // values keeps its codec-default behavior
  })

  it('lets setDefaults override the codec default', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    q.setDefaults({ page: 5 })

    expect(q.defaults).toEqual({ page: 5 })
    expect(q.values).toEqual({ page: 5 })
  })

  it('lets the URL selection override both', () => {
    const { build } = setup({ page: '3' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    expect(q.selected).toEqual({ page: 3 })
    expect(q.values).toEqual({ page: 3 })
  })
})

describe('withRuntimeDefaults layered clearing coherence', () => {
  const schema = {
    page: queryParam('page', codecs.integer.withDefault(1)),
  }

  it('persists an explicit write of the codec default when a runtime default differs', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    q.values.page = 1 // the codec default, but not the effective default (5)
    await flush()

    expect(q.selected).toEqual({ page: 1 }) // kept, not dropped as a default
    expect(q.values).toEqual({ page: 1 }) // reads back what was written
  })

  it('drops a write that equals the effective default, falling back to it', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    q.values.page = 5 // the effective default
    await flush()

    expect(q.selected).toEqual({})
    expect(q.values).toEqual({ page: 5 })
  })

  it('applies the same clearing to patch', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    q.patch({ page: 5 })
    await flush()

    expect(q.selected).toEqual({})
    expect(q.values).toEqual({ page: 5 })
  })
})
