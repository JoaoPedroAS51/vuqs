import type { ParsedQuery, ParsedQueryRaw } from '../../../src/core/query/types'
import type { NavigateOptions } from '../../../src/core/runtime/adapter'
import { describe, expect, it } from 'vitest'
import { isRef, nextTick, ref } from 'vue'
import { toQueryRef } from '../../../src/core/bindings/to-query-ref'
import { toQueryRefs } from '../../../src/core/bindings/to-query-refs'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withContext } from '../../../src/modules/context/module'
import { withTestQuery as setup } from '../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('withContext', () => {
  const schema = {
    q: queryParam('q', codecs.string),
    category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
    sort: queryParam('sort', codecs.literal(['newest', 'oldest'] as const)),
  }

  function setupContext(initial: ParsedQuery = {}) {
    const { query, build } = setup(initial)
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema).use(
        withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } }),
      ),
    )

    return { query, tab, q }
  }

  it('preserves params valid in the active context', () => {
    const { q } = setupContext({ q: 'x', category: 'cpu' })

    expect(q.values).toEqual({ q: 'x', category: 'cpu' })
    expect(q.activeContext.value).toBe('products')
  })

  it('filters an invalid field once the context makes it invalid', async () => {
    const { tab, q } = setupContext({ q: 'x', category: 'cpu' })

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.values.category).toBeUndefined()
  })

  it('builds a query that resets non-preserved fields and keeps preserved ones', () => {
    const { query, q } = setupContext({ q: 'foo', sort: 'newest' })

    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ q: 'foo' })
  })

  it('builds the same query via the key-typed schema form', () => {
    const { query, build } = setup({ q: 'foo', sort: 'newest' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema).use(
        withContext(schema, { active: tab, preserve: ['q'], only: { category: ['products'] } }),
      ),
    )

    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ q: 'foo' })
  })

  it('composes with useQueryState using single-param rules', async () => {
    const { query, build } = setup({ category: 'cpu' })
    const tab = ref<'products' | 'orders'>('products')
    const category = build(() =>
      useQueryState('category', codecs.literal(['cpu', 'gpu'] as const)).use(
        withContext({ active: tab, preserve: true, only: ['products'] }),
      ),
    )

    expect(isRef(category)).toBe(true)
    expect(category.value).toBe('cpu')
    expect(category.activeContext.value).toBe('products')
    expect(category.buildContextQuery(query.value, 'products')).toEqual({ category: 'cpu' })
    expect(category.buildContextQuery(query.value, 'orders')).toEqual({})

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(category.value).toBeUndefined()

    category.set('gpu')
    await flush()

    expect(query.value).toEqual({})
  })

  it('supports active-only context modules on useQueryState', () => {
    const { build } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    const switches: Array<{ target: string, query: ParsedQueryRaw }> = []
    const q = build(() =>
      useQueryState('q').use(
        withContext({
          active: tab,
          navigate: (target, reconciled) => switches.push({ target, query: reconciled }),
        }),
      ),
    )

    q.switchTo('orders')

    expect(q.value).toBe('foo')
    expect(switches).toEqual([{ target: 'orders', query: {} }])
  })
})

describe('withContext buildContextQuery', () => {
  const schema = {
    q: queryParam('q', codecs.string),
    page: queryParam('page', codecs.integer.withDefault(1)),
  }

  it('omits a preserved field equal to its codec default (clearOnDefault on by default)', () => {
    const { query, build } = setup({ q: 'foo', page: '1' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )

    const next = q.buildContextQuery(query.value, 'orders')

    expect(next).toEqual({ q: 'foo' })
  })

  it('keeps a preserved default-valued field when clearOnDefault is false', () => {
    const { query, build } = setup({ q: 'foo', page: '1' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { clearOnDefault: false }).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )

    const next = q.buildContextQuery(query.value, 'orders')

    expect(next).toEqual({ q: 'foo', page: '1' })
  })

  it('does not materialize an absent or invalid default-valued field, even with clearOnDefault false', () => {
    const tab = ref<'products' | 'orders'>('products')

    // Absent: an absent param has nothing to preserve, so a context switch must
    // not synthesize `page`'s default into the URL.
    const absent = setup({ q: 'foo' })
    const qa = absent.build(() =>
      useQueryStates(schema, { clearOnDefault: false }).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )
    expect(qa.buildContextQuery(absent.query.value, 'orders')).toEqual({ q: 'foo' })

    // Invalid: same, and the stale invalid value is dropped from the target.
    const invalid = setup({ q: 'foo', page: 'bad' })
    const qi = invalid.build(() =>
      useQueryStates(schema, { clearOnDefault: false }).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )
    expect(qi.buildContextQuery(invalid.query.value, 'orders')).toEqual({ q: 'foo' })
  })

  it('preserves a permitted partial object without adding missing defaulted children', () => {
    const nestedSchema = {
      record: queryParam.object('record', {
        a: queryParam('a', codecs.integer.withDefault(0)),
        b: queryParam('b', codecs.integer),
      }),
    }
    const { query, build } = setup({ record: { b: '10' } })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(nestedSchema).use(withContext({ active: tab, preserve: ['record'] })),
    )

    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ record: { b: '10' } })
  })

  it('drops a preserved field that is invalid in the target context', () => {
    const ctxSchema = {
      q: queryParam('q', codecs.string),
      category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
    }
    const { query, build } = setup({ q: 'foo', category: 'cpu' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(ctxSchema).use(
        withContext({ active: tab, preserve: ['q', 'category'], only: { category: ['products'] } }),
      ),
    )

    // `category` is preserved and present, but target-context validity takes precedence.
    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ q: 'foo' })
  })
})

describe('withContext switchTo', () => {
  const schema = {
    q: queryParam('q', codecs.string),
    sort: queryParam('sort', codecs.literal(['newest', 'oldest'] as const)),
  }

  it('navigates via the navigate option with the reconciled query', () => {
    const { build } = setup({ q: 'foo', sort: 'newest' })
    const tab = ref<'products' | 'orders'>('products')
    const switches: Array<{ target: string, query: ParsedQueryRaw }> = []
    const q = build(() =>
      useQueryStates(schema).use(
        withContext({
          active: tab,
          preserve: ['q'],
          navigate: (target, reconciled) => switches.push({ target, query: reconciled }),
        }),
      ),
    )

    q.switchTo('orders')

    expect(switches).toEqual([{ target: 'orders', query: { q: 'foo' } }])
  })

  it('forwards per-call navigate options', () => {
    const { build } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    let received: NavigateOptions | undefined
    const q = build(() =>
      useQueryStates(schema).use(
        withContext({
          active: tab,
          navigate: (_target, _query, options) => {
            received = options
          },
        }),
      ),
    )

    q.switchTo('orders', { history: 'push' })

    expect(received).toEqual({ history: 'push' })
  })

  it('throws when no navigate option is provided', () => {
    const { build } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema).use(withContext({ active: tab })),
    )

    expect(() => q.switchTo('orders')).toThrow(/provide a `navigate` option/)
  })
})

describe('withContext validity and preservation', () => {
  type Tab = 'products' | 'orders'

  function context() {
    const { query, build } = setup({})
    const tab = ref<Tab>('products')
    const targets: ParsedQueryRaw[] = []
    const navigate = (target: Tab, next: ParsedQueryRaw): void => {
      targets.push(next)
      query.value = next as ParsedQuery
      tab.value = target
    }

    return { query, build, tab, targets, navigate }
  }

  describe('a preserved param invalid in the target context', () => {
    it('is omitted from the target query and reads undefined despite its static default (grouped)', async () => {
      const { query, build, tab, targets, navigate } = context()
      query.value = { page: '3' }
      const q = build(() => useQueryStates({ page: queryParam('page', codecs.integer.withDefault(1)) }).use(
        withContext({ active: tab, preserve: ['page'], only: { page: ['products'] }, navigate }),
      ))

      expect(q.values.page).toBe(3)

      q.switchTo('orders')
      await nextTick()
      await flush()

      expect(targets).toEqual([{}])
      expect(q.activeContext.value).toBe('orders')
      expect(q.values.page).toBeUndefined()
    })

    it('is omitted from the target query and reads undefined despite its static default (single)', async () => {
      const { query, build, tab, targets, navigate } = context()
      query.value = { page: '3' }
      const q = build(() => useQueryState('page', codecs.integer.withDefault(1)).use(
        withContext({ active: tab, preserve: true, only: ['products'], navigate }),
      ))

      expect(q.value).toBe(3)

      q.switchTo('orders')
      await nextTick()
      await flush()

      expect(targets).toEqual([{}])
      expect(q.value).toBeUndefined()
    })
  })

  describe('a reset valid param', () => {
    it('is omitted from the target query and reads its static default (grouped)', async () => {
      const { query, build, tab, targets, navigate } = context()
      query.value = { label: 'explicit-value' }
      const q = build(() => useQueryStates({ label: queryParam('label', codecs.string.withDefault('fallback')) }).use(
        withContext({ active: tab, navigate }),
      ))

      expect(q.values.label).toBe('explicit-value')

      q.switchTo('orders')
      await nextTick()
      await flush()

      expect(targets).toEqual([{}])
      expect(q.values.label).toBe('fallback')
    })

    it('is omitted from the target query and reads its static default (single)', async () => {
      const { query, build, tab, targets, navigate } = context()
      query.value = { label: 'explicit-value' }
      const q = build(() => useQueryState('label', codecs.string.withDefault('fallback')).use(
        withContext({ active: tab, preserve: false, navigate }),
      ))

      q.switchTo('orders')
      await nextTick()
      await flush()

      expect(targets).toEqual([{}])
      expect(q.value).toBe('fallback')
    })
  })

  describe('a preserved valid param', () => {
    it('retains its explicit value in the target query and read (grouped)', async () => {
      const { query, build, tab, targets, navigate } = context()
      query.value = { label: 'initial' }
      const q = build(() => useQueryStates({ label: queryParam('label', codecs.string.withDefault('')) }).use(
        withContext({ active: tab, preserve: ['label'], navigate }),
      ))

      q.switchTo('orders')
      await nextTick()
      await flush()

      expect(targets).toEqual([{ label: 'initial' }])
      expect(q.values.label).toBe('initial')
    })

    it('retains its explicit value in the target query and read (single)', async () => {
      const { query, build, tab, targets, navigate } = context()
      query.value = { label: 'initial' }
      const q = build(() => useQueryState('label', codecs.string.withDefault('')).use(
        withContext({ active: tab, preserve: true, navigate }),
      ))

      q.switchTo('orders')
      await nextTick()
      await flush()

      expect(targets).toEqual([{ label: 'initial' }])
      expect(q.value).toBe('initial')
    })
  })
})

describe('withContext reads through every lens', () => {
  it('reads a context-filtered defaulted param as absent while the module API stays available', async () => {
    const { build } = setup({ page: '3', label: 'kept' })
    const tab = ref<'products' | 'orders'>('products')
    const grouped = build(() => useQueryStates({
      page: queryParam('page', codecs.integer.withDefault(1)),
      label: queryParam('label', codecs.string.withDefault('')),
    }).use(withContext({ active: tab, only: { page: ['products'] } })))
    const refs = toQueryRefs(grouped)
    const whole = toQueryRef(grouped)

    expect(grouped.values.page).toBe(3)
    expect(refs.page.value).toBe(3)

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(grouped.activeContext.value).toBe('orders')
    expect(grouped.values.page).toBeUndefined()
    expect(refs.page.value).toBeUndefined()
    expect(whole.value.page).toBeUndefined()
    expect(grouped.values.label).toBe('kept')
    expect(refs.label.value).toBe('kept')
  })

  it('reads a context-filtered single param as absent', async () => {
    const { build } = setup({ page: '3' })
    const tab = ref<'products' | 'orders'>('products')
    const page = build(() => useQueryState('page', codecs.integer.withDefault(1)).use(withContext({ active: tab, only: ['products'] })))

    expect(page.value).toBe(3)

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(page.activeContext.value).toBe('orders')
    expect(page.value).toBeUndefined()
  })
})
