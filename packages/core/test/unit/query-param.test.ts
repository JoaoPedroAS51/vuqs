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

  it('reads back the builder default when the param is absent', () => {
    const page = queryParam('page', codecs.integer).withDefault(2)

    expect(page.read({})).toBe(2)
    expect(page.read({ page: '5' })).toBe(5)
  })

  it('does not share a Date default across reads', () => {
    const date = queryParam('date', codecs.isoDate).withDefault(new Date('2026-01-01'))

    const first = date.read({}) as Date
    first.setFullYear(1999)

    expect(date.read({})).toEqual(new Date('2026-01-01'))
  })

  it('overrides the codec default with the builder default', () => {
    const page = queryParam('page', codecs.integer.withDefault(1)).withDefault(2)

    expect(page.defaultValue).toBe(2)
    expect(page.read({})).toBe(2)
  })

  it('applies a withDefault override placed after transform', () => {
    const t = queryParam('n', codecs.integer.withDefault(5))
      .transform<string>({ read: v => `#${v}`, write: v => Number(v.slice(1)) })
      .withDefault('#99')

    expect(t.defaultValue).toBe('#99')
    expect(t.read({})).toBe('#99')
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
    expect(bounds.read({})).toEqual({ north: 1 })
    expect(bounds.read({ bounds: { e: '20' } })).toEqual({ north: 1, east: 20 })
    expect(bounds.write({ north: 2, east: 20 })).toEqual({ bounds: { n: '2', e: '20' } })
  })

  it('applies child defaults only on presence when requested', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      east: queryParam('e', codecs.float),
    }).withDefaultsWhenPresent()

    expect(bounds.read({})).toBeUndefined()
    expect(bounds.read({ bounds: { e: '20' } })).toEqual({ north: 1, east: 20 })
  })

  it('does not share the default object across reads', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
    })

    const first = bounds.read({}) as { north: number }
    first.north = 999

    expect(bounds.read({})).toEqual({ north: 1 })
  })

  it('supports partial object defaults below child defaults', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      south: queryParam('s', codecs.float),
      east: queryParam('e', codecs.float),
    }).withDefault({ north: 0, east: 20 })

    expect(bounds.defaultValue).toEqual({ north: 1, east: 20 })
    expect(bounds.read({})).toEqual({ north: 1, east: 20 })
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
    expect(northEast.read({})).toEqual({ lat: 5 })
    expect(northEast.read({ ne: { lng: '20' } })).toEqual({ lat: 5, lng: 20 })
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

  it('reads a defaulted codec child back when absent', () => {
    const filter = queryParam.object({ page: codecs.integer.withDefault(1) })

    expect(filter.read({})).toEqual({ page: 1 })
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
})
