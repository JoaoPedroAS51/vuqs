import type { Codec } from '../../src/core/codec'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'

describe('codec value types', () => {
  it('infers numeric codecs', () => {
    expectTypeOf(codecs.index).toEqualTypeOf<Codec<number>>()
    expectTypeOf(codecs.hex).toEqualTypeOf<Codec<number>>()
  })

  it('infers Date codecs', () => {
    expectTypeOf(codecs.timestamp).toEqualTypeOf<Codec<Date>>()
    expectTypeOf(codecs.isoDateTime).toEqualTypeOf<Codec<Date>>()
    expectTypeOf(codecs.isoDate).toEqualTypeOf<Codec<Date>>()
  })

  it('infers the number literal union', () => {
    expectTypeOf(codecs.numberLiteral([1, 2, 3])).toEqualTypeOf<Codec<1 | 2 | 3>>()
  })
})
