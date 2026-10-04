import type { DefinedQueryParam, DefinedQueryParamWithDefault } from '../../../../src/core/schema/params/definition'
import type { QueryStateValues } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { parseQueryStates } from '../../../../src/core/schema/operations'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { defineQuerySchema } from '../../../../src/core/schema/schema'

describe('schema value inference', () => {
  it('builds a partial value map keyed by field', () => {
    const schema = {
      currency: queryParam('currency', codecs.string),
      page: queryParam('page', codecs.integer.withDefault(1)),
      statuses: queryParam('filters.statuses', codecs.arrayOf(codecs.string)),
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

describe('defineQuerySchema', () => {
  const filters = defineQuerySchema({
    q: codecs.string,
    page: queryParam('page', codecs.integer.withDefault(1)),
    status: queryParam('status', codecs.literal(['open', 'closed'] as const)),
  })

  it('normalizes codec shorthand to a defined param', () => {
    expectTypeOf(filters.q).toExtend<DefinedQueryParam<string>>()
    expectTypeOf(filters.page).toExtend<DefinedQueryParamWithDefault<number>>()
  })

  it('derives value types from the normalized schema', () => {
    const values = {} as QueryStateValues<typeof filters>

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number | undefined>()
    expectTypeOf(values.status).toEqualTypeOf<'open' | 'closed' | undefined>()
  })

  it('binds through useQueryStates', () => {
    const { values } = useQueryStates(filters)

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number>()
    expectTypeOf(values.status).toEqualTypeOf<'open' | 'closed' | undefined>()
  })
})
