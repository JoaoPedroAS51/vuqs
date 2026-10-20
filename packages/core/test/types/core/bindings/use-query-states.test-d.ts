import type { QueryWriteOptions } from '../../../../src/core/runtime/transaction'
import { describe, expectTypeOf, it } from 'vitest'
import { toQueryRef } from '../../../../src/core/bindings/to-query-ref'
import { toQueryRefs } from '../../../../src/core/bindings/to-query-refs'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
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

  it('accepts per-write default omission through every setter', () => {
    const state = useQueryStates({ page: codecs.integer.withDefault(1) })
    const single = useQueryState('page', codecs.integer.withDefault(1))

    expectTypeOf(state.patch).parameter(1).toEqualTypeOf<QueryWriteOptions | undefined>()
    expectTypeOf(state.replace).parameter(1).toEqualTypeOf<QueryWriteOptions | undefined>()
    expectTypeOf(single.set).parameter(1).toEqualTypeOf<QueryWriteOptions | undefined>()
    expectTypeOf(toQueryRef(state).set).parameter(1).toEqualTypeOf<QueryWriteOptions | undefined>()
    expectTypeOf(toQueryRefs(state).page.set).parameter(1).toEqualTypeOf<QueryWriteOptions | undefined>()
    expectTypeOf<QueryWriteOptions['clearOnDefault']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<'throttleMs'>().not.toExtend<keyof QueryWriteOptions>()
  })
})
