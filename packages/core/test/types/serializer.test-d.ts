import type { QueryStateValues } from '../../src/core/schema'
import type { ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { createSerializer } from '../../src/core/serializer'

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

  it('accepts null to clear and a value to set, and rejects a string base without parse', () => {
    const serialize = createSerializer(schema)

    serialize({ q: null, page: 2 })
    // @ts-expect-error a string base requires the `parse` option
    serialize('?q=x', { q: 'y' })
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

    serialize({ q: 'x', page: 2 })
    // @ts-expect-error page is an integer, not a string
    serialize({ page: '2' })
  })

  it('rejects a string base when only stringify is provided', () => {
    const serialize = createSerializer(schema, { stringify: query => JSON.stringify(query) })

    // @ts-expect-error stringify alone does not enable a string base
    serialize('?q=x', { q: 'y' })
  })
})
