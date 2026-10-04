import { describe, expectTypeOf, it } from 'vitest'
import { ref } from 'vue'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withContext } from '../../../src/modules/context'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('module composition', () => {
  it('accumulates each module API on the composable', () => {
    const tab = ref<'products' | 'orders'>('products')

    const q = useQueryStates(schema)
      .use(withRuntimeDefaults())
      .use(withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } }))

    expectTypeOf(q.values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.selected.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(q.setDefaults).toBeFunction()
  })
})
