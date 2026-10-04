import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { withActiveParams } from '../../../src/modules/active-params'
import { withContext } from '../../../src/modules/context'
import { withTestQuery as setup } from '../../helpers/adapter'

describe('withActiveParams module interactions', () => {
  it('drops context-invalid params when activity is composed before context', async () => {
    const { build } = setup({ category: 'cpu' })
    const activeContext = ref<'products' | 'orders'>('products')
    const q = build(() => {
      const query = useQueryStates({ category: codecs.string }).use(withActiveParams())

      expect(query.activeKeys.value).toEqual(['category'])

      return query.use(withContext({ active: activeContext, only: { category: ['products'] } }))
    })

    activeContext.value = 'orders'
    await nextTick()

    expect(q.activeKeys.value).toEqual([])
  })

  it('drops context-invalid params when context is composed before activity', async () => {
    const { build } = setup({ category: 'cpu' })
    const activeContext = ref<'products' | 'orders'>('products')
    const q = build(() => useQueryStates({ category: codecs.string })
      .use(withContext({ active: activeContext, only: { category: ['products'] } }))
      .use(withActiveParams()))

    expect(q.activeKeys.value).toEqual(['category'])

    activeContext.value = 'orders'
    await nextTick()

    expect(q.activeKeys.value).toEqual([])
  })
})
