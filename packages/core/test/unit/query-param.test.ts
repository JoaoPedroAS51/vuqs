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
})
