import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../../../../src/core/types'
import { describe, expect, it } from 'vitest'
import { isRef, nextTick, ref } from 'vue'
import { codecs } from '../../../../src/core/codec'
import { queryParam } from '../../../../src/core/query-param'
import { useQueryState } from '../../../../src/core/use-query-state'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { withContext } from '../../../../src/modules/context'
import { withTestQuery as setup } from '../../../helpers/adapter'

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

  it('drops a field invalid in the active context from values', () => {
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

  it('works the same via the key-typed schema form', () => {
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
    const { query, build } = setup({ q: 'foo' })
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
    const { query, build } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { clearOnDefault: false }).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )

    const next = q.buildContextQuery(query.value, 'orders')

    expect(next).toEqual({ q: 'foo', page: '1' })
  })

  it('applies the navigate pipeline stage', () => {
    const { query, build } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema)
        .use((core) => {
          core.pipeline.tap('navigate', next => ({ ...next, flag: 'on' }))
          return {}
        })
        .use(withContext({ active: tab, preserve: ['q'] })),
    )

    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ q: 'foo', flag: 'on' })
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

    // category is preserved AND present, but invalid in 'orders' → validity wins over preserve.
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
