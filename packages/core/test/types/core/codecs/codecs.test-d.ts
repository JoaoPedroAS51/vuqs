import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Codec, CodecWithDefault } from '../../../../src/core/codecs/codec'
import { describe, expectTypeOf, it } from 'vitest'
import { toQueryRefs } from '../../../../src/core/bindings/to-query-refs'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../src/core/codecs/codec'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { createSerializer } from '../../../../src/core/schema/serializer'

describe('nullable codec types', () => {
  it('widens built-in, factory, and custom value types', () => {
    expectTypeOf(codecs.string.nullable()).toEqualTypeOf<Codec<string | null>>()
    expectTypeOf(codecs.integer.nullable()).toEqualTypeOf<Codec<number | null>>()
    expectTypeOf(codecs.boolean.nullable()).toEqualTypeOf<Codec<boolean | null>>()
    expectTypeOf(codecs.isoDate.nullable()).toEqualTypeOf<Codec<Date | null>>()
    expectTypeOf(codecs.literal(['asc', 'desc']).nullable()).toEqualTypeOf<Codec<'asc' | 'desc' | null>>()
    expectTypeOf(codecs.arrayOf(codecs.string).nullable()).toEqualTypeOf<Codec<string[] | null>>()
    expectTypeOf(codecs.json<{ id: number }>().nullable()).toEqualTypeOf<Codec<{ id: number } | null>>()
    expectTypeOf(createCodec({ parse: codecs.string.parse, serialize: (value: string) => value }).nullable())
      .toEqualTypeOf<Codec<string | null>>()

    expectTypeOf(codecs.integer.nullable().serialize).parameter(0).toEqualTypeOf<number | null>()
    expectTypeOf(codecs.integer.serialize).parameter(0).toEqualTypeOf<number>()
  })

  it('preserves defaulted types in both modifier orders', () => {
    expectTypeOf(codecs.string.nullable().withDefault(null)).toEqualTypeOf<CodecWithDefault<string | null>>()
    expectTypeOf(codecs.string.withDefault('').nullable()).toEqualTypeOf<CodecWithDefault<string | null>>()
    expectTypeOf(codecs.string.withDefault('').nullable().withDefault(null).nullable())
      .toEqualTypeOf<CodecWithDefault<string | null>>()
    expectTypeOf(codecs.string.nullable().nullable()).toEqualTypeOf<Codec<string | null>>()
  })

  it('narrows bound reads only when a default is declared', () => {
    const nullable = codecs.string.nullable()
    const noDefault = useQueryState('q', nullable)
    const defaulted = useQueryState('q', nullable.withDefault(null))
    const query = useQueryStates({
      q: queryParam('search.q', nullable).withDefault(null),
      count: codecs.integer.nullable(),
    })
    const refs = toQueryRefs(query)

    expectTypeOf(noDefault.value).toEqualTypeOf<string | null | undefined>()
    expectTypeOf(defaulted.value).toEqualTypeOf<string | null>()
    expectTypeOf(query.values.q).toEqualTypeOf<string | null>()
    expectTypeOf(refs.q.value).toEqualTypeOf<string | null>()
    expectTypeOf(refs.count.value).toEqualTypeOf<number | null | undefined>()

    expectTypeOf(defaulted.set).parameter(0).toEqualTypeOf<string | null>()
    expectTypeOf<{ q: null }>().toExtend<Parameters<typeof query.patch>[0]>()
    expectTypeOf<{ q: null }>().toExtend<Parameters<typeof query.replace>[0]>()
    const serialize = createSerializer({ q: nullable })
    expectTypeOf(serialize).toBeFunction()
    expectTypeOf<{ q: null }>().toExtend<Parameters<typeof serialize>[1]>()
  })
})

describe('codec value types', () => {
  it('infers JSON values from callback and Standard Schema outputs', () => {
    const schema: StandardSchemaV1<string, number> = {
      '~standard': { version: 1, vendor: 'test', validate: value => ({ value: String(value).length }) },
    }

    expectTypeOf(codecs.json({ validate: schema })).toEqualTypeOf<Codec<number>>()
    expectTypeOf(codecs.json({ validate: (value: unknown) => String(value) })).toEqualTypeOf<Codec<string>>()
    expectTypeOf(codecs.json<{ id: number }>()).toEqualTypeOf<Codec<{ id: number }>>()
    expectTypeOf(codecs.json()).toEqualTypeOf<Codec<unknown>>()
    expectTypeOf(codecs.json({ validate: schema }).withDefault(0).defaultValue).toEqualTypeOf<number>()

    const callableSchema = Object.assign((value: unknown): string | number => String(value), schema)
    expectTypeOf(codecs.json({ validate: callableSchema })).toEqualTypeOf<Codec<number>>()

    expectTypeOf<{ validate: typeof schema }>().not.toExtend<Parameters<typeof codecs.json<string>>[0]>()
  })
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
