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

  it('infers the enum member union', () => {
    enum StringStatus {
      Active = 'active',
      Archived = 'archived',
    }

    enum NumericLevel {
      Low,
      High,
    }

    expectTypeOf(codecs.enum(StringStatus).parse('x')).toEqualTypeOf<StringStatus | undefined>()
    expectTypeOf(codecs.enum(NumericLevel).parse('x')).toEqualTypeOf<NumericLevel | undefined>()
    expectTypeOf(codecs.enum(StringStatus).serialize).parameter(0).toEqualTypeOf<StringStatus>()

    // A plain `as const` object narrows to its value union, no enum required.
    const roles = { admin: 'admin', user: 'user' } as const
    expectTypeOf(codecs.enum(roles).parse('x')).toEqualTypeOf<'admin' | 'user' | undefined>()
  })
})
