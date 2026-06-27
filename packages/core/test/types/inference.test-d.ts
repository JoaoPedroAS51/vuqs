import type { Codec } from '../../src/core/codec'
import type { QueryParamDefinition, QueryParamDefinitionWithDefault } from '../../src/core/define-query-param'
import type { QueryStateValues } from '../../src/core/schema'
import type { UseQueryStateReturn } from '../../src/core/use-query-state'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryParam } from '../../src/core/define-query-param'
import { parseQueryStates } from '../../src/core/schema'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

describe('codec inference', () => {
  it('infers scalar value types', () => {
    expectTypeOf(codecs.string).toEqualTypeOf<Codec<string>>()
    expectTypeOf(codecs.integer).toEqualTypeOf<Codec<number>>()
    expectTypeOf(codecs.boolean).toEqualTypeOf<Codec<boolean>>()
  })

  it('infers array and literal types', () => {
    expectTypeOf(codecs.arrayOf(codecs.integer)).toEqualTypeOf<Codec<number[]>>()
    expectTypeOf(codecs.literal(['asc', 'desc'])).toEqualTypeOf<Codec<'asc' | 'desc'>>()
  })
})

describe('defineQueryParam inference', () => {
  it('carries the codec value type (path form)', () => {
    expectTypeOf(defineQueryParam('currency', codecs.string)).toEqualTypeOf<QueryParamDefinition<string>>()
    expectTypeOf(defineQueryParam('page', codecs.integer.withDefault(1))).toEqualTypeOf<QueryParamDefinitionWithDefault<number>>()
  })

  it('infers the value type from parse (composite form)', () => {
    const dateRange = defineQueryParam({
      paths: ['from', 'to'],
      parse: (): { from: string, to: string } | undefined => undefined,
      serialize: value => ({ from: value.from, to: value.to }),
    })

    expectTypeOf(dateRange).toEqualTypeOf<QueryParamDefinition<{ from: string, to: string }>>()
  })
})

describe('schema value inference', () => {
  it('builds a partial value map keyed by field', () => {
    const schema = {
      currency: defineQueryParam('currency', codecs.string),
      page: defineQueryParam('page', codecs.integer.withDefault(1)),
      statuses: defineQueryParam('filters.statuses', codecs.arrayOf(codecs.string)),
    }

    expectTypeOf<QueryStateValues<typeof schema>>().toEqualTypeOf<{
      currency?: string
      page?: number
      statuses?: string[]
    }>()

    expectTypeOf(parseQueryStates(schema, {})).toEqualTypeOf<{
      currency?: string
      page?: number
      statuses?: string[]
    }>()
  })
})

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
    // @ts-expect-error a number default requires a codec, e.g. codecs.integer.withDefault(0)
    useQueryState('count', { defaultValue: 0 })
  })

  it('narrows a defaulted definition to a non-nullable ref', () => {
    expectTypeOf(useQueryState(defineQueryParam('page', codecs.integer.withDefault(1))))
      .toEqualTypeOf<UseQueryStateReturn<number, object, number>>()
    expectTypeOf(useQueryState(defineQueryParam('q', codecs.string)))
      .toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
  })
})

describe('useQueryStates inference', () => {
  it('narrows defaulted fields to T and keeps others nullable in values', () => {
    const { values } = useQueryStates({
      q: defineQueryParam('q', codecs.string),
      page: defineQueryParam('page', codecs.integer.withDefault(1)),
    })

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number>()
  })
})
