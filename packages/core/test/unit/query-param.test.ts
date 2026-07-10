import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'

describe('queryParam', () => {
  it('defines a scalar param from a path and codec', () => {
    const page = queryParam('page', codecs.integer)

    expect(page.paths).toEqual(['page'])
    expect(page.read({ page: '2' })).toBe(2)
    expect(page.write(2)).toEqual({ page: '2' })
  })

  it('defaults to a plain string param when given no codec or options', () => {
    const q = queryParam('q')

    expect(q.defaultValue).toBeUndefined()
    expect(q.read({ q: 'phone' })).toBe('phone')
    expect(q.write('phone')).toEqual({ q: 'phone' })
  })

  it('supports string shorthand defaults', () => {
    const q = queryParam('q', { defaultValue: 'all' })

    expect(q.defaultValue).toBe('all')
  })

  it('supports local defaults and equality', () => {
    const date = queryParam('date', codecs.isoDate)
      .withDefault(new Date('2026-01-01'))
      .withEquality((a, b) => a.valueOf() === b.valueOf())

    expect(date.defaultValue).toEqual(new Date('2026-01-01'))
    expect(date.eq(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(true)
  })

  it('reads a pure selection, omitting an absent defaulted param', () => {
    const page = queryParam('page', codecs.integer).withDefault(2)

    expect(page.defaultValue).toBe(2)
    expect(page.read({})).toBeUndefined()
    expect(page.read({ page: '5' })).toBe(5)
  })

  it('reads an invalid value as absent, not as its default', () => {
    const page = queryParam('page', codecs.integer).withDefault(2)

    expect(page.read({ page: 'bad' })).toBeUndefined()
  })

  it('overrides the codec default with the builder default', () => {
    const page = queryParam('page', codecs.integer.withDefault(1)).withDefault(2)

    expect(page.defaultValue).toBe(2)
    expect(page.read({ page: '5' })).toBe(5)
  })

  it('applies a withDefault override placed after transform', () => {
    const t = queryParam('n', codecs.integer.withDefault(5))
      .transform<string>({ read: v => `#${v}`, write: v => Number(v.slice(1)) })
      .withDefault('#99')

    expect(t.defaultValue).toBe('#99')
    expect(t.read({})).toBeUndefined()
    expect(t.read({ n: '7' })).toBe('#7')
  })
})

describe('queryParam.object', () => {
  it('composes child params under a prefix', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      east: queryParam('e', codecs.float),
    })

    expect(bounds.paths).toEqual(['bounds.n', 'bounds.e'])
    expect(bounds.read({})).toBeUndefined()
    expect(bounds.read({ bounds: { e: '20' } })).toEqual({ east: 20 }) // pure selection; the default fills in `values`
    expect(bounds.write({ north: 2, east: 20 })).toEqual({ bounds: { n: '2', e: '20' } })
  })

  it('reads a withDefaultsWhenPresent object as a pure selection', () => {
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
    expect(bounds.read({ bounds: { s: '5' } })).toEqual({ south: 5 }) // pure selection
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

  it('derives the transformed default and equality from the input', () => {
    const center = queryParam.object('map', {
      lat: queryParam('lat', codecs.float).withDefault(0),
      lng: queryParam('lng', codecs.float).withDefault(0),
    }).transform({
      read(value) {
        return { point: { lat: value.lat ?? 0, lng: value.lng ?? 0 } }
      },
      write(value) {
        return { lat: value.point.lat, lng: value.point.lng }
      },
    })

    expect(center.defaultValue).toEqual({ point: { lat: 0, lng: 0 } })
    expect(center.eq(
      { point: { lat: 0, lng: 0 } },
      { point: { lat: 0, lng: 0 } },
    )).toBe(true)
    expect(center.eq(
      { point: { lat: 0, lng: 0 } },
      { point: { lat: 1, lng: 0 } },
    )).toBe(false)
  })

  it('prefixes an existing object while keeping its partial default', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float),
      lng: queryParam('lng', codecs.float),
    }).withDefault({ lat: 5 })
    const northEast = queryParam.object('ne', point)

    expect(northEast.defaultValue).toEqual({ lat: 5 })
    expect(northEast.read({})).toBeUndefined()
    expect(northEast.read({ ne: { lng: '20' } })).toEqual({ lng: 20 }) // pure selection
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

  it('reads a defaulted codec child as a selection, absent object omitted', () => {
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

  it('keeps a default-valued object param in the URL when keepOnDefault is set', () => {
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

    expect(filter.read({ b: 'x' })).toEqual({ b: 'x' }) // pure selection
  })

  it('omits a child from the written query when its value is absent', () => {
    const filter = queryParam.object({
      a: queryParam('a', codecs.string),
      b: queryParam('b', codecs.string),
    })

    expect(filter.write({ a: undefined as unknown as string, b: 'x' })).toEqual({ b: 'x' })
  })

  it('throws when a prefix is given without children', () => {
    expect(() => (queryParam.object as (prefix: string) => unknown)('bounds')).toThrowError(
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
    const northEast = queryParam.object('ne', point).withEquality((a, b) => a.lat === b.lat)

    expect(northEast.eq({ lat: 1 }, { lat: 1 })).toBe(true)
    expect(northEast.eq({ lat: 1 }, { lat: 2 })).toBe(false)
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

    expect(northEast.read({})).toBeUndefined()
    expect(northEast.read({ ne: { lat: '1' } })).toEqual({ lat: 1 })
  })
})
