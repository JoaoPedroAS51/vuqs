import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withContext } from '../../../src/modules/context/module'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults/module'
import { withTestQuery as setup } from '../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// withContext emits 'context:change'; withRuntimeDefaults listens for it to reset
// stale per-context defaults.
describe('withRuntimeDefaults + withContext', () => {
  it('clears provided defaults on a context change without the modules referencing each other', async () => {
    const schema = {
      q: queryParam('q', codecs.string),
      category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
    }
    const { build } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema)
        .use(withRuntimeDefaults())
        .use(withContext({ active: tab, only: { category: ['products'] } })),
    )

    q.setDefaults({ q: 'preset' })
    expect(q.defaults).toEqual({ q: 'preset' })

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.defaults).toEqual({})
  })

  it('keeps a context-invalid field out of defaults and values (even with a codec default)', async () => {
    const schema = {
      q: queryParam('q', codecs.string),
      category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const).withDefault('cpu')),
    }
    const { build } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema)
        .use(withRuntimeDefaults())
        .use(withContext({ active: tab, only: { category: ['products'] } })),
    )

    expect(q.values.category).toBe('cpu')

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.defaults.category).toBeUndefined()
    expect(q.values.category).toBeUndefined()
  })

  it('resets the runtime defaults in either composition order', async () => {
    const schema = { q: queryParam('q', codecs.string) }
    const { build } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema)
        .use(withContext({ active: tab }))
        .use(withRuntimeDefaults()),
    )

    q.setDefaults({ q: 'preset' })
    expect(q.values.q).toBe('preset')

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.defaults).toEqual({})
    expect(q.values.q).toBeUndefined()
  })

  it('leaves another module\'s default source in place on a context change', async () => {
    const schema = { q: queryParam('q', codecs.string) }
    const { build } = setup()
    const tab = ref<'products' | 'orders'>('products')
    const q = build(() =>
      useQueryStates(schema)
        .use(() => ({ api: {}, defaults: [{ q: 'sibling' }] }))
        .use(withRuntimeDefaults())
        .use(withContext({ active: tab })),
    )

    q.setDefaults({ q: 'preset' })
    expect(q.values.q).toBe('preset')

    tab.value = 'orders'
    await nextTick()
    await flush()

    expect(q.values.q).toBe('sibling')
  })
})
