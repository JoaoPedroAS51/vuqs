import type { Codec } from '../../src/core/codec'
import type { QueryStateDefinition } from '../../src/core/define-query-state'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'

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
