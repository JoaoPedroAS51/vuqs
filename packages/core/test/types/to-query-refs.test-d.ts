import type { QueryStateRef } from '../../src/core/use-query-state'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { toQueryRefs } from '../../src/core/to-query-refs'
import { useQueryStates } from '../../src/core/use-query-states'

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('toQueryRefs typing', () => {
  it('explodes the composable into QueryStateRefs, narrowing per param', () => {
    const query = useQueryStates(schema)
    const refs = toQueryRefs(query)

    expectTypeOf(refs.q).toEqualTypeOf<QueryStateRef<string | undefined>>()
    expectTypeOf(refs.page).toEqualTypeOf<QueryStateRef<number>>()
    expectTypeOf(refs.q.set).toBeFunction()
    expectTypeOf(refs.q.clear).toBeFunction()
  })

  it('rejects a plain value map: read-only maps go through Vue toRefs', () => {
    const { values } = useQueryStates(schema)
    // @ts-expect-error values is not a binding source; pass the composable
    toQueryRefs(values)
  })
})
