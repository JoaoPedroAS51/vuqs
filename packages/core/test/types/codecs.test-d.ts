import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Codec, CodecWithDefault } from '../../src/core/codec'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs, createCodec } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { createSerializer } from '../../src/core/serializer'
import { toQueryRefs } from '../../src/core/to-query-refs'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

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

    codecs.integer.nullable().serialize(null)
    // @ts-expect-error nullable does not accept another value type
    codecs.integer.nullable().serialize('1')
    // @ts-expect-error the original codec stays non-nullable
    codecs.integer.serialize(null)
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

    defaulted.set(null)
    query.patch({ q: null })
    query.replace({ q: null })
    createSerializer({ q: nullable })({ q: null })
    // @ts-expect-error a defaulted single ref clears through clear()
    defaulted.set(undefined)
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

    // @ts-expect-error the schema returns a number, not a string
    codecs.json<string>({ validate: schema })
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
