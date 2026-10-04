import type { DefinedQueryParam, DefinedQueryParamWithDefault } from '../../../../../src/core/schema/params/definition'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryStates } from '../../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../../src/core/schema/params/query-param'

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
    expectTypeOf(queryParam('page', codecs.integer)).not.toHaveProperty('withDefaultsWhenPresent')
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
