import type { Codec } from '../../src/core/codec'
import type { QueryStateDefinition } from '../../src/core/define-query-state'
import type { QueryStateValues } from '../../src/core/schema'
import type { QueryStateRef } from '../../src/core/use-query-states'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
import { parseQueryStates } from '../../src/core/schema'
import { useQueryState } from '../../src/core/use-query-state'

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

describe('defineQueryState inference', () => {
  it('carries the codec value type (path form)', () => {
    expectTypeOf(defineQueryState('currency', codecs.string)).toEqualTypeOf<QueryStateDefinition<string>>()
    expectTypeOf(defineQueryState('page', codecs.integer.withDefault(1))).toEqualTypeOf<QueryStateDefinition<number>>()
  })

  it('infers the value type from parse (composite form)', () => {
    const dateRange = defineQueryState({
      paths: ['from', 'to'],
      parse: (): { from: string, to: string } | undefined => undefined,
      serialize: value => ({ from: value.from, to: value.to }),
    })

    expectTypeOf(dateRange).toEqualTypeOf<QueryStateDefinition<{ from: string, to: string }>>()
  })
})

describe('schema value inference', () => {
  it('builds a partial value map keyed by field', () => {
    const schema = {
      currency: defineQueryState('currency', codecs.string),
      page: defineQueryState('page', codecs.integer.withDefault(1)),
      statuses: defineQueryState('filters.statuses', codecs.arrayOf(codecs.string)),
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
    expectTypeOf(useQueryState('q')).toEqualTypeOf<QueryStateRef<string | undefined>>()
    expectTypeOf(useQueryState('q', { history: 'push' })).toEqualTypeOf<QueryStateRef<string | undefined>>()
    expectTypeOf(useQueryState('q', { defaultValue: 'x' })).toEqualTypeOf<QueryStateRef<string>>()
  })

  it('keeps codec inference', () => {
    expectTypeOf(useQueryState('q', codecs.string)).toEqualTypeOf<QueryStateRef<string | undefined>>()
    expectTypeOf(useQueryState('page', codecs.integer.withDefault(1))).toEqualTypeOf<QueryStateRef<number>>()
  })

  it('rejects a non-string defaultValue without a codec', () => {
    // @ts-expect-error a number default requires a codec, e.g. codecs.integer.withDefault(0)
    useQueryState('count', { defaultValue: 0 })
  })
})
