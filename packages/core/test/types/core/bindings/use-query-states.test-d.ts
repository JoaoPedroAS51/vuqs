import { describe, expectTypeOf, it } from 'vitest'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'

describe('useQueryStates inference', () => {
  it('narrows defaulted fields to T and keeps others nullable in values', () => {
    const { values } = useQueryStates({
      q: queryParam('q', codecs.string),
      page: queryParam('page', codecs.integer.withDefault(1)),
    })

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number>()
  })

  it('accepts codecs directly using schema keys as query paths', () => {
    const { values } = useQueryStates({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    })

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number>()
  })
})
