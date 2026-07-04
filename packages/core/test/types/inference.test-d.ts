import type { Codec } from '../../src/core/codec'
import type {
  DefinedQueryParam,
  DefinedQueryParamWithDefault,
} from '../../src/core/defined-query-param'
import type { QueryStateValues } from '../../src/core/schema'
import type { UseQueryStateReturn } from '../../src/core/use-query-state'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
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

describe('queryParam inference', () => {
  it('carries scalar value types', () => {
    expectTypeOf(queryParam('q')).toExtend<DefinedQueryParam<string>>()
    expectTypeOf(queryParam('q', { defaultValue: '' })).toExtend<DefinedQueryParamWithDefault<string>>()
    expectTypeOf(queryParam('page', codecs.integer)).toExtend<DefinedQueryParam<number>>()
    expectTypeOf(queryParam('page', codecs.integer.withDefault(1))).toExtend<DefinedQueryParamWithDefault<number>>()
  })

  it('infers object values from children and child defaults', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      south: queryParam('s', codecs.float),
    })

    expectTypeOf(bounds).toExtend<DefinedQueryParam<{
      north: number
      south?: number
    }>>()
  })

  it('infers object values from bare codec children', () => {
    const filter = queryParam.object({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    })

    expectTypeOf(filter).toExtend<DefinedQueryParam<{
      q?: string
      page: number
    }>>()
  })

  it('infers object values from a mix of codecs and defined params', () => {
    const filter = queryParam.object({
      foo: codecs.string,
      bar: queryParam('bar', codecs.string),
    })

    expectTypeOf(filter).toExtend<DefinedQueryParam<{
      foo?: string
      bar?: string
    }>>()
  })

  it('keeps object defaults partial while narrowing the top-level value', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      south: queryParam('s', codecs.float),
      east: queryParam('e', codecs.float),
    }).withDefault({ east: 20 })

    const { values } = useQueryStates({ bounds })

    expectTypeOf(values.bounds).toEqualTypeOf<{
      north: number
      south?: number
      east?: number
    }>()
  })

  it('infers prefixed object definitions', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
    })
    const viewport = queryParam.object('viewport', {
      northEast: queryParam.object('ne', point),
      southWest: queryParam.object('sw', point),
    })

    expectTypeOf(viewport).toExtend<DefinedQueryParam<{
      northEast?: {
        lat?: number
        lng?: number
      }
      southWest?: {
        lat?: number
        lng?: number
      }
    }>>()
  })

  it('infers transformed public values', () => {
    const center = queryParam.object('map', {
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
      zoom: queryParam('z', codecs.integer.withDefault(10)),
    }).transform({
      read(value): { point: { lat: number, lng: number }, zoom: number } | undefined {
        if (value.lat === undefined || value.lng === undefined) {
          return undefined
        }

        return {
          point: { lat: value.lat, lng: value.lng },
          zoom: value.zoom,
        }
      },
      write(value) {
        return {
          lat: value.point.lat,
          lng: value.point.lng,
          zoom: value.zoom,
        }
      },
    })

    expectTypeOf(center).toExtend<DefinedQueryParam<{
      point: { lat: number, lng: number }
      zoom: number
    }>>()
  })
})

describe('scalar queryParam inference', () => {
  it('carries the codec value type (path form)', () => {
    expectTypeOf(queryParam('currency', codecs.string)).toExtend<DefinedQueryParam<string>>()
    expectTypeOf(queryParam('page', codecs.integer.withDefault(1))).toExtend<DefinedQueryParamWithDefault<number>>()
  })

  it('does not expose withDefaultsWhenPresent on scalar params', () => {
    // @ts-expect-error withDefaultsWhenPresent is an object-only modifier
    queryParam('page', codecs.integer).withDefaultsWhenPresent()
  })

  it('exposes withDefaultsWhenPresent on object params', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float),
    })

    expectTypeOf(bounds.withDefaultsWhenPresent).toBeFunction()
  })

  it('keeps object semantics when prefixing an object param', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
    }).withDefault({ lat: 5 })
    const northEast = queryParam.object('ne', point)

    expectTypeOf(northEast.withDefaultsWhenPresent).toBeFunction()
    expectTypeOf(northEast).toExtend<DefinedQueryParamWithDefault<{
      lat?: number
      lng?: number
    }>>()
  })
})

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
    expectTypeOf(useQueryState(queryParam('page', codecs.integer.withDefault(1))))
      .toEqualTypeOf<UseQueryStateReturn<number, object, number>>()
    expectTypeOf(useQueryState(queryParam('q', codecs.string)))
      .toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
  })

  it('accepts queryParam definitions', () => {
    expectTypeOf(useQueryState(queryParam('page', codecs.integer).withDefault(1)))
      .toEqualTypeOf<UseQueryStateReturn<number, object, number>>()
    expectTypeOf(useQueryState(queryParam('q')))
      .toEqualTypeOf<UseQueryStateReturn<string | undefined, object, string>>()
  })
})

describe('useQueryStates inference', () => {
  it('narrows defaulted fields to T and keeps others nullable in values', () => {
    const { values } = useQueryStates({
      q: queryParam('q', codecs.string),
      page: queryParam('page', codecs.integer.withDefault(1)),
    })

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number>()
  })

  it('accepts codecs directly using schema keys as query paths', () => {
    const { values } = useQueryStates({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    })

    expectTypeOf(values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.page).toEqualTypeOf<number>()
  })
})
