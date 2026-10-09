import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../../src/core/schema/params/query-param'

describe('queryParam.object', () => {
  it.each([
    { name: 'string values', input: { range: { min: '0', max: '2.5' }, flags: ['true', 'false'] } },
    { name: 'mixed values', input: { range: { min: 0, max: 2.5 }, flags: [true, false] } },
  ])('reads nested objects and arrays with $name', ({ input }) => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', { min: codecs.float, max: codecs.float }),
      flags: codecs.arrayOf(codecs.boolean),
    })

    expect(filters.read({ filters: input })).toEqual({ range: { min: 0, max: 2.5 }, flags: [true, false] })
  })

  it('reads a parsed JSON child alongside other child params', () => {
    const filters = queryParam.object('filters', {
      q: codecs.string,
      payload: codecs.json<{ labels: string[] }>(),
    })

    expect(filters.read({ filters: { q: 'search', payload: { labels: ['a', 'b'] } } })).toEqual({
      q: 'search',
      payload: { labels: ['a', 'b'] },
    })
  })

  it('composes child params under a prefix', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      east: queryParam('e', codecs.float),
    })

    expect(bounds.paths).toEqual(['bounds.n', 'bounds.e'])
    expect(bounds.read({})).toBeUndefined()
    expect(bounds.read({ bounds: { e: '20' } })).toEqual({ east: 20 }) // explicit values; the default fills in `values`
    expect(bounds.write({ north: 2, east: 20 })).toEqual({ bounds: { n: '2', e: '20' } })
  })

  it('reads a withDefaultsWhenPresent object as explicit values', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      east: queryParam('e', codecs.float),
    }).withDefaultsWhenPresent()

    expect(bounds.read({})).toBeUndefined()
    expect(bounds.read({ bounds: { e: '20' } })).toEqual({ east: 20 })
  })

  it('reports its merged default (child defaults over the object-level default)', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      south: queryParam('s', codecs.float),
      east: queryParam('e', codecs.float),
    }).withDefault({ north: 0, east: 20 })

    expect(bounds.defaultValue).toEqual({ north: 1, east: 20 })
    expect(bounds.read({ bounds: { s: '5' } })).toEqual({ south: 5 }) // explicit values
  })

  it('prefixes an existing object definition', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
    })
    const northEast = queryParam.object('ne', point)

    expect(northEast.paths).toEqual(['ne.lat', 'ne.lng'])
    expect(northEast.read({ ne: { lat: '10', lng: '20' } })).toEqual({ lat: 10, lng: 20 })
    expect(northEast.write({ lat: 10, lng: 20 })).toEqual({ ne: { lat: '10', lng: '20' } })
  })

  it('derives the transformed default from the input', () => {
    const center = queryParam.object('map', {
      lat: queryParam('lat', codecs.float).withDefault(0),
      lng: queryParam('lng', codecs.float).withDefault(0),
    }).transform({
      read(value) {
        return { point: { lat: value.lat, lng: value.lng } }
      },
      write(value) {
        return { lat: value.point.lat, lng: value.point.lng }
      },
    })

    expect(center.defaultValue).toEqual({ point: { lat: 0, lng: 0 } })
    expect(center.read({ map: { lat: '10' } })).toEqual({ point: { lat: 10, lng: 0 } })
  })

  it('derives transformed equality from the input equality', () => {
    const center = queryParam.object('map', {
      lat: codecs.float.withDefault(0),
    }).withEquality((a, b) => Math.round(a.lat) === Math.round(b.lat)).transform({
      read: value => ({ point: value.lat }),
      write: value => ({ lat: value.point }),
    })

    expect(center.eq({ point: 1.1 }, { point: 1.4 })).toBe(true)
    expect(center.eq({ point: 1.1 }, { point: 2.4 })).toBe(false)
  })

  it('prefixes an existing object while keeping its partial default', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
    }).withDefault({ lat: 5 })
    const northEast = queryParam.object('ne', point)

    expect(northEast.defaultValue).toEqual({ lat: 5 })
    expect(northEast.read({})).toBeUndefined()
    expect(northEast.read({ ne: { lng: '20' } })).toEqual({ lng: 20 }) // explicit values
  })

  it('transforms a child object into a public value', () => {
    const center = queryParam.object('map', {
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
      zoom: queryParam('z', codecs.integer.withDefault(10)),
    }).transform({
      read(value) {
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

    expect(center.paths).toEqual(['map.lat', 'map.lng', 'map.z'])
    expect(center.read({ map: { lat: '10', lng: '20' } })).toEqual({
      point: { lat: 10, lng: 20 },
      zoom: 10,
    })
    expect(center.write({ point: { lat: 10, lng: 20 }, zoom: 12 })).toEqual({
      map: { lat: '10', lng: '20', z: '12' },
    })
  })

  it('accepts a bare codec child, binding it to the child key', () => {
    const filter = queryParam.object({ q: codecs.string })

    expect(filter.paths).toEqual(['q'])
    expect(filter.read({ q: 'hello' })).toEqual({ q: 'hello' })
    expect(filter.write({ q: 'hello' })).toEqual({ q: 'hello' })
  })

  it('treats a bare codec and its verbose form as equivalent', () => {
    const bare = queryParam.object({ q: codecs.string })
    const verbose = queryParam.object({ q: queryParam('q', codecs.string) })

    expect(bare.paths).toEqual(verbose.paths)
    expect(bare.read({ q: 'x' })).toEqual(verbose.read({ q: 'x' }))
    expect(bare.write({ q: 'x' })).toEqual(verbose.write({ q: 'x' }))
  })

  it('mixes bare codecs and defined params in one child map', () => {
    const filter = queryParam.object({
      foo: codecs.string,
      bar: queryParam('bar', codecs.string),
    })

    expect(filter.paths).toEqual(['foo', 'bar'])
    expect(filter.read({ foo: 'a', bar: 'b' })).toEqual({ foo: 'a', bar: 'b' })
    expect(filter.write({ foo: 'a', bar: 'b' })).toEqual({ foo: 'a', bar: 'b' })
  })

  it('reads a defaulted codec child as an explicit value, absent object omitted', () => {
    const filter = queryParam.object({ page: codecs.integer.withDefault(1) })

    expect(filter.read({})).toBeUndefined()
    expect(filter.read({ page: '5' })).toEqual({ page: 5 })
  })

  it('prefixes bare codec children under the child key', () => {
    const bounds = queryParam.object('bounds', {
      north: codecs.float,
      east: codecs.float,
    })

    expect(bounds.paths).toEqual(['bounds.north', 'bounds.east'])
    expect(bounds.read({ bounds: { north: '10', east: '20' } })).toEqual({ north: 10, east: 20 })
    expect(bounds.write({ north: 10, east: 20 })).toEqual({ bounds: { north: '10', east: '20' } })
  })

  it('overrides equality on an object param', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float),
    }).withEquality((a, b) => Math.round(a.north ?? 0) === Math.round(b.north ?? 0))

    expect(bounds.eq({ north: 1.1 }, { north: 1.4 })).toBe(true)
    expect(bounds.eq({ north: 1.1 }, { north: 2.4 })).toBe(false)
  })

  it('disables clearOnDefault on an object param when keepOnDefault is set', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
    }).keepOnDefault()

    expect(bounds.clearOnDefault).toBe(false)
  })

  it('reads as absent when the present keys all fail to parse and there is no default', () => {
    const filter = queryParam.object({
      count: queryParam('count', codecs.integer),
    })

    expect(filter.read({ count: 'not-a-number' })).toBeUndefined()
  })

  it('falls back to the object-level default for an individual absent child', () => {
    const filter = queryParam.object({
      a: queryParam('a', codecs.string),
      b: queryParam('b', codecs.string),
    }).withDefault({ a: 'fallback-a' })

    const parsedValue = filter.read({ b: 'x' })!

    expect(parsedValue).toEqual({ b: 'x' })
    expect(filter.resolve!(parsedValue, filter.defaultValue)).toEqual({ a: 'fallback-a', b: 'x' })
  })

  it('omits a child from the written query when its value is absent', () => {
    const filter = queryParam.object({
      a: queryParam('a', codecs.string),
      b: queryParam('b', codecs.string),
    })

    expect(filter.write({ a: undefined, b: 'x' })).toEqual({ b: 'x' })
  })

  it('throws when a prefix is given without children', () => {
    expect(() => (queryParam.object as (prefix: string) => unknown)('bounds')).toThrow(
      '[vuqs] queryParam.object(prefix, children) requires children.',
    )
  })

  it('delegates withDefault through a prefixed param', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
    })
    const northEast = queryParam.object('ne', point).withDefault({ lat: 5 })

    expect(northEast.defaultValue).toEqual({ lat: 5 })
    expect(northEast.paths).toEqual(['ne.lat', 'ne.lng'])
  })

  it('delegates withEquality through a prefixed param', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
    })
    const northEast = queryParam.object('ne', point).withEquality((a, b) => Math.round(a.lat!) === Math.round(b.lat!))

    expect(northEast.eq({ lat: 1.1 }, { lat: 1.4 })).toBe(true)
    expect(northEast.eq({ lat: 1.1 }, { lat: 2.4 })).toBe(false)
  })

  it('delegates keepOnDefault through a prefixed param', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float).withDefault(0),
    })
    const northEast = queryParam.object('ne', point).keepOnDefault()

    expect(northEast.clearOnDefault).toBe(false)
  })

  it('delegates withDefaultsWhenPresent through a prefixed param', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float).withDefault(0),
    })
    const northEast = queryParam.object('ne', point).withDefaultsWhenPresent()

    expect(point.defaultValue).toEqual({ lat: 0 })
    expect(point.presenceGated).toBe(false)
    expect(northEast.defaultValue).toBeUndefined()
    expect(northEast.presenceGated).toBe(true)

    expect(northEast.read({})).toBeUndefined()
    expect(northEast.read({ ne: { lat: '1' } })).toEqual({ lat: 1 })
  })
})
