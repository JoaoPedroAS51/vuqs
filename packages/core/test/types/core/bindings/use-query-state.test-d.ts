import type { QueryStateRef } from '../../../../src/core/bindings/binding'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'

describe('useQueryState signatures', () => {
  it('infers string for the implicit forms', () => {
    expectTypeOf(useQueryState('q').value).toEqualTypeOf<string | undefined>()
    expectTypeOf(useQueryState('q', { history: 'push' }).value).toEqualTypeOf<string | undefined>()
    expectTypeOf(useQueryState('q', { defaultValue: 'x' }).value).toEqualTypeOf<string>()
  })

  it('keeps codec inference', () => {
    expectTypeOf(useQueryState('q', codecs.string).value).toEqualTypeOf<string | undefined>()
    expectTypeOf(useQueryState('page', codecs.integer.withDefault(1)).value).toEqualTypeOf<number>()
  })

  it('exposes the ref contract with matching read and write types', () => {
    expectTypeOf(useQueryState('q')).toExtend<QueryStateRef<string | undefined>>()
    expectTypeOf(useQueryState('page', codecs.integer.withDefault(1))).toExtend<QueryStateRef<number>>()
  })

  it('rejects a non-string defaultValue without a codec', () => {
    expectTypeOf(useQueryState).toExtend<(path: string, options: { defaultValue: string }) => unknown>()
    expectTypeOf(useQueryState).not.toExtend<(path: string, options: { defaultValue: number }) => unknown>()
  })

  it('narrows a defaulted definition to a non-nullable ref', () => {
    const page = useQueryState(queryParam('page', codecs.integer.withDefault(1)))
    const q = useQueryState(queryParam('q', codecs.string))

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.set).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(q.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.set).parameter(0).toEqualTypeOf<string | undefined>()
  })

  it('accepts queryParam definitions', () => {
    expectTypeOf(useQueryState(queryParam('page', codecs.integer).withDefault(1)).value).toEqualTypeOf<number>()
    expectTypeOf(useQueryState(queryParam('q')).value).toEqualTypeOf<string | undefined>()
  })
})
