import type { ComputedRef } from 'vue'
import type { QueryStateRef } from '../../src/core/use-query-states'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryParam } from '../../src/core/define-query-param'
import { toQueryRefs } from '../../src/core/to-query-refs'
import { useQueryStates } from '../../src/core/use-query-states'
import { withEffective } from '../../src/modules/effective'

const schema = {
  q: defineQueryParam('q', codecs.string),
  page: defineQueryParam('page', codecs.integer.withDefault(1)),
}

describe('toQueryRefs typing', () => {
  it('explodes the writable values map into QueryStateRefs', () => {
    const { values } = useQueryStates(schema)
    const refs = toQueryRefs(values)

    expectTypeOf(refs.q).toEqualTypeOf<QueryStateRef<string | undefined>>()
    expectTypeOf(refs.page).toEqualTypeOf<QueryStateRef<number>>()
    expectTypeOf(refs.q.set).toBeFunction()
    expectTypeOf(refs.q.clear).toBeFunction()
  })

  it('explodes a read-only map into plain computed refs without set/clear', () => {
    const q = useQueryStates(schema).use(withEffective())
    const refs = toQueryRefs(q.effective)

    expectTypeOf(refs.q).toEqualTypeOf<ComputedRef<string | undefined>>()
    expectTypeOf(refs).not.toHaveProperty('set')
    expectTypeOf(refs.q).not.toHaveProperty('set')
  })
})
