import type { UseQueryStateReturn } from '../../../../src/core/bindings/use-query-state'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'

describe('useQueryState signatures', () => {
  it('infers string for the implicit forms', () => {
    expectTypeOf(useQueryState('q')).toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
    expectTypeOf(useQueryState('q', { history: 'push' })).toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
    expectTypeOf(useQueryState('q', { defaultValue: 'x' })).toEqualTypeOf<UseQueryStateReturn<string, object, string>>()
  })

  it('keeps codec inference', () => {
    expectTypeOf(useQueryState('q', codecs.string)).toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
    expectTypeOf(useQueryState('page', codecs.integer.withDefault(1))).toEqualTypeOf<UseQueryStateReturn<number, object, number>>()
  })

  it('rejects a non-string defaultValue without a codec', () => {
    expectTypeOf(useQueryState).toExtend<(path: string, options: { defaultValue: string }) => unknown>()
    expectTypeOf(useQueryState).not.toExtend<(path: string, options: { defaultValue: number }) => unknown>()
  })

  it('narrows a defaulted definition to a non-nullable ref', () => {
    expectTypeOf(useQueryState(queryParam('page', codecs.integer.withDefault(1))))
      .toEqualTypeOf<UseQueryStateReturn<number, object, number>>()
    expectTypeOf(useQueryState(queryParam('q', codecs.string)))
      .toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
  })

  it('accepts queryParam definitions', () => {
    expectTypeOf(useQueryState(queryParam('page', codecs.integer).withDefault(1)))
      .toEqualTypeOf<UseQueryStateReturn<number, object, number>>()
    expectTypeOf(useQueryState(queryParam('q')))
      .toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
  })
})
