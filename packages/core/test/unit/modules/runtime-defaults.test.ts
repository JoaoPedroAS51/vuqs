import { describe, expect, it } from 'vitest'
import { isRef, ref } from 'vue'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults/module'
import { withTestQuery as setup } from '../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('withRuntimeDefaults', () => {
  const schema = {
    currency: queryParam('currency', codecs.string),
    region: queryParam('region', codecs.string),
  }

  it('separates explicit values, defaults, and resolved values', () => {
    const { build } = setup({ currency: 'EUR' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    q.setDefaults({ currency: 'USD', region: 'us' })

    expect(q.explicitValues).toEqual({ currency: 'EUR' })
    expect(q.defaults).toEqual({ currency: 'USD', region: 'us' })
    expect(q.values).toEqual({ currency: 'EUR', region: 'us' })
  })

  it('falls back to the default in values when a field is cleared', async () => {
    const { build } = setup({ currency: 'EUR' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ currency: 'USD' })

    q.values.currency = undefined
    await flush()

    expect(q.explicitValues).toEqual({})
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
    expect(used.explicitValue.value).toBe('EUR')
    expect(used.defaultValue.value).toBe('USD')

    currency.clear()
    await flush()

    expect(query.value).toEqual({})
    expect(currency.value).toBe('USD')
    expect(used.explicitValue.value).toBeUndefined()

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
    expect(page.explicitValue.value).toBe(1)
    expect(page.value).toBe(1)

    page.value = 5
    await flush()

    expect(query.value).toEqual({})
    expect(page.explicitValue.value).toBeUndefined()
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
    expect(used.explicitValue.value).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(used.defaultValue.value).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('withRuntimeDefaults + codec defaults', () => {
  const schema = {
    q: queryParam('q', codecs.string),
    page: queryParam('page', codecs.integer.withDefault(1)),
  }

  it('uses the codec default as the lowest fallback, keeping explicit values separate', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({})
    expect(q.defaults).toEqual({ page: 1 }) // codec default
    expect(q.values).toEqual({ page: 1 }) // falls through to the codec default
    expect(q.values.page).toBe(1) // values keeps its codec-default behavior
  })

  it('setDefaults overrides the codec default', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    q.setDefaults({ page: 5 })

    expect(q.defaults).toEqual({ page: 5 })
    expect(q.values).toEqual({ page: 5 })
  })

  it('the URL state overrides both defaults', () => {
    const { build } = setup({ page: '3' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    expect(q.explicitValues).toEqual({ page: 3 })
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

    expect(q.explicitValues).toEqual({ page: 1 }) // kept, not dropped as a default
    expect(q.values).toEqual({ page: 1 }) // reads back what was written
  })

  it('drops a write that equals the effective default, falling back to it', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    q.values.page = 5 // the effective default
    await flush()

    expect(q.explicitValues).toEqual({})
    expect(q.values).toEqual({ page: 5 })
  })

  it('applies the same clearing to patch', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    q.patch({ page: 5 })
    await flush()

    expect(q.explicitValues).toEqual({})
    expect(q.values).toEqual({ page: 5 })
  })
})

describe('withRuntimeDefaults bindings sharing a schema', () => {
  const value = queryParam('value', codecs.integer.withDefault(1))
  const record = queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })

  function mountPair(initial: Parameters<typeof setup>[0] = {}) {
    const test = setup(initial)
    const a = test.build(() => useQueryStates({ value }).use(withRuntimeDefaults()))
    const b = test.build(() => useQueryStates({ value }).use(withRuntimeDefaults()))

    return { test, a, b }
  }

  it('keeps independent contributions over one static default', () => {
    const { a, b } = mountPair()

    a.setDefaults({ value: 5 })
    b.setDefaults({ value: 9 })
    expect([a.values.value, b.values.value]).toEqual([5, 9])

    a.setDefaults({ value: 6 })
    expect([a.values.value, b.values.value]).toEqual([6, 9])

    a.clearDefaults()
    expect([a.values.value, b.values.value]).toEqual([1, 9])
  })

  it('shares an explicit write optimistically and after navigation while defaults stay local', async () => {
    const { test, a, b } = mountPair()

    a.setDefaults({ value: 5 })
    b.setDefaults({ value: 9 })
    a.patch({ value: 7 })

    expect([a.values.value, b.values.value]).toEqual([7, 7])
    expect(test.query.value).toEqual({})

    await flush()
    expect(test.query.value).toEqual({ value: '7' })
    expect([a.values.value, b.values.value]).toEqual([7, 7])

    a.patch({ value: undefined })
    await flush()
    expect([a.values.value, b.values.value]).toEqual([5, 9])
  })

  it('keeps explicit writes isolated between separate adapters', async () => {
    const first = setup()
    const second = setup()
    const a = first.build(() => useQueryStates({ value }).use(withRuntimeDefaults()))
    const b = second.build(() => useQueryStates({ value }).use(withRuntimeDefaults()))

    a.setDefaults({ value: 5 })
    b.setDefaults({ value: 9 })
    a.patch({ value: 7 })
    await flush()

    expect([a.values.value, b.values.value]).toEqual([7, 9])
    expect(second.query.value).toEqual({})
  })

  it('does not let a mutated resolved object corrupt another binding', () => {
    const shared = queryParam.object('record', {
      a: queryParam('a', codecs.integer),
      b: queryParam('b', codecs.integer),
    }).withDefault({ a: 0, b: 100 })
    const test = setup()
    const first = test.build(() => useQueryStates({ record: shared }).use(withRuntimeDefaults()))
    const second = test.build(() => useQueryStates({ record: shared }).use(withRuntimeDefaults()))

    ;(first.values.record as { a: number }).a = -1

    expect(second.values.record).toEqual({ a: 0, b: 100 })
  })

  it('reveals the next source for a composed contribution per binding', () => {
    const test = setup()
    const first = test.build(() => useQueryStates({ record }).use(withRuntimeDefaults()))
    const second = test.build(() => useQueryStates({ record }).use(withRuntimeDefaults()))

    first.setDefaults({ record: { a: 5 } })

    expect(first.values.record).toEqual({ a: 5, b: 100 })
    expect(second.values.record).toEqual({ a: 0, b: 100 })
  })
})

describe('withRuntimeDefaults source priority', () => {
  const schema = {
    currency: queryParam('currency', codecs.string),
  }

  it('lets a later source win over its runtime defaults and an earlier source lose to them', () => {
    const { build } = setup()
    const earlier = ref<{ currency?: string }>({ currency: 'earlier' })
    const later = ref<{ currency?: string }>({ currency: 'later' })
    const q = build(() => useQueryStates(schema)
      .use(() => ({ api: {}, defaults: [earlier] }))
      .use(withRuntimeDefaults())
      .use(() => ({ api: {}, defaults: [later] })))

    q.setDefaults({ currency: 'runtime' })
    expect(q.values.currency).toBe('later')

    later.value = {}
    expect(q.values.currency).toBe('runtime')

    q.clearDefaults()
    expect(q.values.currency).toBe('earlier')
  })

  it('keeps its precedence slot when cleared and set again', () => {
    const { build } = setup()
    const later = ref<{ currency?: string }>({})
    const q = build(() => useQueryStates(schema)
      .use(withRuntimeDefaults())
      .use(() => ({ api: {}, defaults: [later] })))

    q.setDefaults({ currency: 'first' })
    q.clearDefaults()
    q.setDefaults({ currency: 'second' })
    expect(q.values.currency).toBe('second')

    later.value = { currency: 'later' }
    expect(q.values.currency).toBe('later')
    later.value = {}
    expect(q.values.currency).toBe('second')
  })

  it('keeps the slot of a single-param default', () => {
    const { build } = setup()
    const later = ref<{ value?: string }>({})
    const withLater = defineQueryModule({ state: () => ({ api: {}, defaults: [later] }) })
    const q = build(() => useQueryState('currency').use(withRuntimeDefaults()).use(withLater()))

    q.setDefault('first')
    q.clearDefault()
    q.setDefault('second')
    expect(q.value).toBe('second')

    later.value = { value: 'later' }
    expect(q.value).toBe('later')
  })
})
