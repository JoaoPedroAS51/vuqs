import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { codecs } from '../../../../src/core/codec'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { withActiveParams } from '../../../../src/modules/active-params'
import { withContext } from '../../../../src/modules/context'
import { withRuntimeDefaults } from '../../../../src/modules/runtime-defaults'
import { withTestQuery as setup } from '../../../helpers/adapter'

describe('withActiveParams module interactions', () => {
  it('reacts to runtime-default layers registered after activity is composed', () => {
    const { build } = setup({ status: 'open' })
    const q = build(() => useQueryStates({
      status: codecs.string.withDefault('all'),
    })
      .use(withActiveParams())
      .use(withRuntimeDefaults()))

    expect(q.activeKeys.value).toEqual(['status'])

    q.setDefaults({ status: 'open' })
    expect(q.activeKeys.value).toEqual([])

    q.setDefaults({ status: 'closed' })
    expect(q.activeKeys.value).toEqual(['status'])
  })

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
