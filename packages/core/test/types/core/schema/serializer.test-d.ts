import type { ParsedQuery, ParsedQueryRaw } from '../../../../src/core/query/types'
import type { QueryStateValues } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { createSerializer } from '../../../../src/core/schema/serializer'

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('createSerializer types', () => {
  it('returns a query object and accepts an object base by default', () => {
    const serialize = createSerializer(schema)

    expectTypeOf(serialize({ q: 'x' })).toEqualTypeOf<ParsedQueryRaw>()
    expectTypeOf(serialize({} as ParsedQuery, { q: 'x' })).toEqualTypeOf<ParsedQueryRaw>()
  })

  it('returns a string when stringify is provided', () => {
    const serialize = createSerializer(schema, { stringify: query => JSON.stringify(query) })

    expectTypeOf(serialize({ q: 'x' })).toEqualTypeOf<string>()
  })

  it('accepts a string base when parse is provided', () => {
    const serialize = createSerializer(schema, { parse: search => JSON.parse(search) })

    expectTypeOf(serialize('?q=x', { q: 'y' })).toEqualTypeOf<ParsedQueryRaw>()
  })

  it('accepts undefined to clear and rejects null outside the codec type', () => {
    const serialize = createSerializer(schema)

    expectTypeOf(serialize).toBeFunction()
    expectTypeOf<{ q: undefined, page: number }>().toExtend<Parameters<typeof serialize>[1]>()
    expectTypeOf<{ q: null }>().not.toExtend<Parameters<typeof serialize>[1]>()
    expectTypeOf<string>().not.toExtend<Parameters<typeof serialize>[0]>()
  })

  it('accepts read values (QueryStateValues) as write values', () => {
    const serialize = createSerializer(schema)
    const readValues: QueryStateValues<typeof schema> = { q: 'x', page: 2 }

    expectTypeOf(serialize(readValues)).toEqualTypeOf<ParsedQueryRaw>()
    expectTypeOf(serialize({} as ParsedQuery, readValues)).toEqualTypeOf<ParsedQueryRaw>()
  })

  it('accepts direct codecs and infers write values from normalized schema', () => {
    const serialize = createSerializer({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    })

    expectTypeOf(serialize).toBeFunction()
    expectTypeOf<{ q: string, page: number }>().toExtend<Parameters<typeof serialize>[1]>()
    expectTypeOf<{ page: string }>().not.toExtend<Parameters<typeof serialize>[1]>()
  })

  it('rejects a string base when only stringify is provided', () => {
    const serialize = createSerializer(schema, { stringify: query => JSON.stringify(query) })

    expectTypeOf(serialize).toBeFunction()
    expectTypeOf<string>().not.toExtend<Parameters<typeof serialize>[0]>()
  })
})
