import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { codecs } from '../../../../src/core/codec'
import { queryParam } from '../../../../src/core/query-param'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { withContext } from '../../../../src/modules/context'
import { withRuntimeDefaults } from '../../../../src/modules/runtime-defaults'
import { withTestQuery as setup } from '../../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// withContext emits 'context:change'; withRuntimeDefaults listens for it to reset
// stale per-context defaults. This is a documented, load-bearing interaction
// between two specific built-in modules (not a generic composition mechanism),
// so it gets its own file rather than living inside either module's own tests.
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
})
