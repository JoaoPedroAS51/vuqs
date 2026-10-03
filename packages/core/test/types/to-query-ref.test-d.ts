import { describe, expectTypeOf, it } from 'vitest'
import { toQueryRef } from '../../src/core/bindings/to-query-ref'
import { useQueryStates } from '../../src/core/bindings/use-query-states'
import { codecs } from '../../src/core/codecs/catalog'
import { queryParam } from '../../src/core/schema/params/query-param'

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('toQueryRef typing', () => {
  it('returns a whole-object writable ref of the value map', () => {
    const query = useQueryStates(schema)
    const ref = toQueryRef(query)

    expectTypeOf(ref.value).toEqualTypeOf<{ q?: string, page?: number }>()
    expectTypeOf(ref.set).toBeFunction()
    expectTypeOf(ref.clear).toBeFunction()
  })

  it('rejects a plain value map: it is not a binding source', () => {
    const { values } = useQueryStates(schema)
    // @ts-expect-error values is not a binding source; pass the composable
    toQueryRef(values)
  })
})
