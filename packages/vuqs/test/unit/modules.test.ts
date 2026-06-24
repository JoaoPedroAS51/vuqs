import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
import { useQueryStates } from '../../src/core/use-query-states'
import { withContext } from '../../src/modules/context'
import { withEffective } from '../../src/modules/effective'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function setup(initial: ParsedQuery = {}) {
  const query = ref<ParsedQuery>(initial)
  const navigate = vi.fn((next: ParsedQueryRaw) => {
    query.value = next
  })

  return { query, navigate }
}

// Build inside an effect scope so module watches/filters own a scope (matches setup usage).
function build<T>(factory: () => T): T {
  return effectScope().run(factory) as T
}

describe('withEffective', () => {
  const schema = {
    currency: defineQueryState('currency', codecs.string),
    region: defineQueryState('region', codecs.string),
  }

  it('separates selected, defaults, and effective', () => {
    const { query, navigate } = setup({ currency: 'EUR' })
    const q = build(() => useQueryStates(schema, { query, navigate }).use(withEffective()))

    q.setDefaults({ currency: 'USD', region: 'us' })

    expect(q.selected).toEqual({ currency: 'EUR' })
    expect(q.defaults).toEqual({ currency: 'USD', region: 'us' })
    expect(q.effective).toEqual({ currency: 'EUR', region: 'us' })
  })

  it('falls back to the default in effective when a field is cleared', async () => {
    const { query, navigate } = setup({ currency: 'EUR' })
    const q = build(() => useQueryStates(schema, { query, navigate }).use(withEffective()))
    q.setDefaults({ currency: 'USD' })

    q.values.currency = undefined
    await flush()

    expect(q.selected).toEqual({})
    expect(q.effective).toEqual({ currency: 'USD' })
  })

  it('clears provided defaults', () => {
    const { query, navigate } = setup()
    const q = build(() => useQueryStates(schema, { query, navigate }).use(withEffective()))

    q.setDefaults({ currency: 'USD' })
    q.clearDefaults()

    expect(q.effective).toEqual({})
  })
})

describe('withEffective + codec defaults', () => {
  const schema = {
    q: defineQueryState('q', codecs.string),
    page: defineQueryState('page', codecs.integer.withDefault(1)),
  }

  it('uses the codec default as the lowest fallback, keeping selected explicit', () => {
    const { query, navigate } = setup()
    const q = build(() => useQueryStates(schema, { query, navigate }).use(withEffective()))

    expect(q.selected).toEqual({}) // explicit only — no codec default here
    expect(q.defaults).toEqual({ page: 1 }) // codec default
    expect(q.effective).toEqual({ page: 1 }) // falls through to the codec default
    expect(q.values.page).toBe(1) // values keeps its codec-default behavior
  })

  it('lets setDefaults override the codec default', () => {
    const { query, navigate } = setup()
    const q = build(() => useQueryStates(schema, { query, navigate }).use(withEffective()))

    q.setDefaults({ page: 5 })

    expect(q.defaults).toEqual({ page: 5 })
    expect(q.effective).toEqual({ page: 5 })
  })

  it('lets the URL selection override both', () => {
    const { query, navigate } = setup({ page: '3' })
    const q = build(() => useQueryStates(schema, { query, navigate }).use(withEffective()))
    q.setDefaults({ page: 5 })

    expect(q.selected).toEqual({ page: 3 })
    expect(q.effective).toEqual({ page: 3 })
  })
})

describe('withContext', () => {
  const schema = {
    q: defineQueryState('q', codecs.string),
    category: defineQueryState('category', codecs.literal(['cpu', 'gpu'] as const)),
    sort: defineQueryState('sort', codecs.literal(['newest', 'oldest'] as const)),
  }

  function setupContext(initial: ParsedQuery = {}) {
    const { query, navigate } = setup(initial)
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate }).use(
        withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } }),
      ),
    )

    return { query, navigate, tab, q }
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
    const { query, navigate } = setup({ q: 'foo', sort: 'newest' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate }).use(
        withContext(schema, { active: tab, preserve: ['q'], only: { category: ['products'] } }),
      ),
    )

    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ q: 'foo' })
  })
})

describe('withContext buildContextQuery', () => {
  const schema = {
    q: defineQueryState('q', codecs.string),
    page: defineQueryState('page', codecs.integer.withDefault(1)),
  }

  it('omits a preserved field equal to its codec default (clearOnDefault on by default)', () => {
    const { query, navigate } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate }).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )

    const next = q.buildContextQuery(query.value, 'orders')

    expect(next).toEqual({ q: 'foo' })
  })

  it('keeps a preserved default-valued field when clearOnDefault is false', () => {
    const { query, navigate } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate, clearOnDefault: false }).use(
        withContext({ active: tab, preserve: ['q', 'page'] }),
      ),
    )

    const next = q.buildContextQuery(query.value, 'orders')

    expect(next).toEqual({ q: 'foo', page: '1' })
  })

  it('applies the navigate pipeline stage', () => {
    const { query, navigate } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate })
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
      q: defineQueryState('q', codecs.string),
      category: defineQueryState('category', codecs.literal(['cpu', 'gpu'] as const)),
    }
    const { query, navigate } = setup({ q: 'foo', category: 'cpu' })
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(ctxSchema, { query, navigate }).use(
        withContext({ active: tab, preserve: ['q', 'category'], only: { category: ['products'] } }),
      ),
    )

    // category is preserved AND present, but invalid in 'orders' → validity wins over preserve.
    expect(q.buildContextQuery(query.value, 'orders')).toEqual({ q: 'foo' })
  })
})

describe('withContext switchTo', () => {
  const schema = {
    q: defineQueryState('q', codecs.string),
    sort: defineQueryState('sort', codecs.literal(['newest', 'oldest'] as const)),
  }

  it('navigates via the navigate option with the reconciled query', () => {
    const { query, navigate } = setup({ q: 'foo', sort: 'newest' })
    const tab = ref<'products' | 'orders'>('products')
    const switches: Array<{ target: string, query: ParsedQueryRaw }> = []
    const q = build(() =>
      useQueryStates(schema, { query, navigate }).use(
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
    const { query, navigate } = setup({ q: 'foo' })
    const tab = ref<'products' | 'orders'>('products')
    let received: NavigateOptions | undefined
    const q = build(() =>
      useQueryStates(schema, { query, navigate }).use(
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
    const { query, navigate } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate }).use(withContext({ active: tab })),
    )

    expect(() => q.switchTo('orders')).toThrow(/provide a `navigate` option/)
  })
})

describe('module coordination via hooks', () => {
  it('clears provided defaults on a context change without the modules referencing each other', async () => {
    const schema = {
      q: defineQueryState('q', codecs.string),
      category: defineQueryState('category', codecs.literal(['cpu', 'gpu'] as const)),
    }
    const { query, navigate } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate })
        .use(withEffective())
        .use(withContext({ active: tab, only: { category: ['products'] } })),
    )

    q.setDefaults({ q: 'preset' })
    expect(q.defaults).toEqual({ q: 'preset' })

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.defaults).toEqual({})
  })

  it('keeps a context-invalid field out of defaults and effective (even with a codec default)', async () => {
    const schema = {
      q: defineQueryState('q', codecs.string),
      category: defineQueryState('category', codecs.literal(['cpu', 'gpu'] as const).withDefault('cpu')),
    }
    const { query, navigate } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema, { query, navigate })
        .use(withEffective())
        .use(withContext({ active: tab, only: { category: ['products'] } })),
    )

    expect(q.effective.category).toBe('cpu')

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.defaults.category).toBeUndefined()
    expect(q.effective.category).toBeUndefined()
  })
})

describe('use() collision guard', () => {
  const schema = { q: defineQueryState('q', codecs.string) }

  it('throws when two modules contribute the same key', () => {
    const { query, navigate } = setup()

    expect(() =>
      build(() =>
        useQueryStates(schema, { query, navigate })
          .use(() => ({ shared: 1 }))
          .use(() => ({ shared: 2 })),
      ),
    ).toThrow(/module key "shared" is already provided/)
  })

  it('throws when a module overwrites a built-in key', () => {
    const { query, navigate } = setup()

    expect(() =>
      build(() => useQueryStates(schema, { query, navigate }).use(() => ({ clear: () => {} }))),
    ).toThrow(/module key "clear" is already provided/)
  })
})
