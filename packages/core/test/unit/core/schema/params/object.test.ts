import { describe, expect, it, vi } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { getParamStructure } from '../../../../../src/core/schema/params/definition'
import { queryParam } from '../../../../../src/core/schema/params/query-param'
import { resolveParamValue } from '../../../../../src/core/schema/resolution'

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

  it('reports its composed default (object-level default over child defaults)', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      south: queryParam('s', codecs.float),
      east: queryParam('e', codecs.float),
    }).withDefault({ north: 0, east: 20 })

    expect(bounds.defaultValue).toEqual({ north: 0, east: 20 })
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
    }).withEquality((a, b) => Math.round(a.lat ?? 0) === Math.round(b.lat ?? 0)).transform({
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
    expect(resolveParamValue(filter, parsedValue, getParamStructure(filter)?.staticCandidate)).toEqual({ a: 'fallback-a', b: 'x' })
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
    expect(northEast.defaultValue).toEqual({ lat: 0 })
    expect(northEast.presenceGated).toBe(true)

    expect(northEast.read({})).toBeUndefined()
    expect(northEast.read({ ne: { lat: '1' } })).toEqual({ lat: 1 })
  })
})

describe('queryParam.object static default composition', () => {
  const pair = () => ({
    a: queryParam('a', codecs.integer),
    b: queryParam('b', codecs.integer),
  })

  describe('object contributions', () => {
    it('lets an object default override a child static default', () => {
      const object = queryParam.object({
        a: queryParam('a', codecs.integer.withDefault(1)),
        b: queryParam('b', codecs.integer),
      }).withDefault({ a: 9, b: 2 })

      expect(object.defaultValue).toEqual({ a: 9, b: 2 })
    })

    it('keeps inherited child defaults for omitted children without mutating the children', () => {
      const a = queryParam('a', codecs.integer.withDefault(1))
      const b = queryParam('b', codecs.integer.withDefault(2))
      const object = queryParam.object({ a, b }).withDefault({ a: 9 })

      expect(object.defaultValue).toEqual({ a: 9, b: 2 })
      expect(a.defaultValue).toBe(1)
      expect(b.defaultValue).toBe(2)
    })

    it('falls through on undefined and overrides with a supported null', () => {
      const child = queryParam('a', codecs.integer.nullable().withDefault(1))
      const object = queryParam.object({ a: child })

      expect(object.withDefault({ a: undefined }).defaultValue).toEqual({ a: 1 })
      expect(object.withDefault({ a: null }).defaultValue).toEqual({ a: null })
    })

    it('replaces an override and reveals the original child defaults', () => {
      const object = queryParam.object({
        a: queryParam('a', codecs.integer.withDefault(1)),
        b: queryParam('b', codecs.integer.withDefault(2)),
      })
      const first = object.withDefault({ a: 9 })
      const second = first.withDefault({ b: 8 })

      expect(second.defaultValue).toEqual({ a: 1, b: 8 })
      expect(first.defaultValue).toEqual({ a: 9, b: 2 })
      expect(object.defaultValue).toEqual({ a: 1, b: 2 })
    })

    it('replaces the own fill instead of accumulating repeated declarations', () => {
      const withChildDefault = queryParam.object({
        a: queryParam('a', codecs.integer.withDefault(1)),
        b: queryParam('b', codecs.integer),
        c: queryParam('c', codecs.integer),
      })
      const first = withChildDefault.withDefault({ b: 2 })

      expect(first.withDefault({ c: 3 }).defaultValue).toEqual({ a: 1, c: 3 })
      expect(first.defaultValue).toEqual({ a: 1, b: 2 })

      const bare = queryParam.object(pair()).withDefault({ a: 0, b: 100 })

      expect(bare.withDefault({ a: 10 }).defaultValue).toEqual({ a: 10 })
      expect(bare.defaultValue).toEqual({ a: 0, b: 100 })
    })

    it('reveals an inherited child default when its own override is replaced', () => {
      const object = queryParam.object({
        a: queryParam('a', codecs.integer),
        b: queryParam('b', codecs.integer.withDefault(100)),
      })

      expect(object.withDefault({ a: 0, b: 200 }).withDefault({ a: 10 }).defaultValue).toEqual({ a: 10, b: 100 })
    })
  })

  describe('enclosing contributions', () => {
    it('lets an enclosing contribution override supplied descendant paths', () => {
      const inner = queryParam.object({
        a: queryParam('a', codecs.integer),
        b: queryParam('b', codecs.integer),
      }).withDefault({ a: 1 })
      const outer = queryParam.object({ inner }).withDefault({ inner: { a: 0, b: 2 } })

      expect(outer.defaultValue).toEqual({ inner: { a: 0, b: 2 } })
      expect(queryParam.object('p', outer).defaultValue).toEqual({ inner: { a: 0, b: 2 } })
    })

    it('combines independent static contributions', () => {
      const inner = queryParam.object({
        a: queryParam('a', codecs.integer),
        b: queryParam('b', codecs.integer),
      }).withDefault({ a: 1 })

      expect(queryParam.object({ inner }).withDefault({ inner: { b: 2 } }).defaultValue).toEqual({
        inner: { a: 1, b: 2 },
      })
    })

    it('overrides one child and preserves its sibling', () => {
      const nested = queryParam.object({
        a: queryParam('a', codecs.integer.withDefault(0)),
        b: queryParam('b', codecs.integer.withDefault(100)),
      })
      const outer = queryParam.object({ nested }).withDefault({ nested: { a: 10 } })

      expect(outer.defaultValue).toEqual({ nested: { a: 10, b: 100 } })
    })

    it('does not mutate a reused child object', () => {
      const nested = queryParam.object({
        a: queryParam('a', codecs.integer.withDefault(0)),
        b: queryParam('b', codecs.integer.withDefault(100)),
      })
      const first = queryParam.object({ nested }).withDefault({ nested: { a: 10 } })
      const second = queryParam.object({ nested }).withDefault({ nested: { a: 20 } })

      expect(first.defaultValue).toEqual({ nested: { a: 10, b: 100 } })
      expect(second.defaultValue).toEqual({ nested: { a: 20, b: 100 } })
      expect(nested.defaultValue).toEqual({ a: 0, b: 100 })
    })

    it('follows source precedence from the param through the enclosing object', () => {
      const nested = queryParam.object({
        a: queryParam('a', codecs.integer.withDefault(20)),
        b: queryParam('b', codecs.integer),
      }).withDefault({ a: 10 })
      const outer = queryParam.object({ nested }).withDefault({ nested: { a: 0, b: 100 } })

      expect(outer.defaultValue).toEqual({ nested: { a: 0, b: 100 } })
    })
  })

  describe('presence gate', () => {
    it.each([
      ['own default before the gate', () => queryParam.object(pair()).withDefault({ b: 2 }).withDefaultsWhenPresent()],
      ['gate before the own default', () => queryParam.object(pair()).withDefaultsWhenPresent().withDefault({ b: 2 })],
    ])('keeps the gate and the own candidate with %s', (_name, build) => {
      const object = build()

      expect(object.presenceGated).toBe(true)
      expect(object.defaultValue).toEqual({ b: 2 })
    })

    it('keeps the gate when the own contribution is replaced', () => {
      const gated = queryParam.object(pair()).withDefault({ a: 1, b: 100 }).withDefaultsWhenPresent()
      const replaced = gated.withDefault({ a: 5 })

      expect(replaced.presenceGated).toBe(true)
      expect(replaced.defaultValue).toEqual({ a: 5 })
      expect(gated.presenceGated).toBe(true)
      expect(gated.defaultValue).toEqual({ a: 1, b: 100 })
    })

    it('keeps an enclosing contribution to a gated child as a candidate', () => {
      const record = queryParam.object(pair()).withDefaultsWhenPresent()
      const container = queryParam.object({ record }).withDefault({ record: { a: 9 } })

      expect(container.presenceGated).toBe(false)
      expect(container.defaultValue).toEqual({ record: { a: 9 } })
    })

    it.each([
      ['unprefixed', (param: ReturnType<typeof queryParam.object>) => param],
      ['prefixed', (param: ReturnType<typeof queryParam.object>) => queryParam.object('p', param)],
    ])('carries gated child candidates through a %s ungated container', (_name, wrap) => {
      const record = queryParam.object({ a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
      const container = wrap(queryParam.object({ record }))

      expect(container.presenceGated).toBe(false)
      expect(container.defaultValue).toEqual({ record: { a: 1 } })
    })
  })
})

describe('transformed param defaults', () => {
  const range = () => queryParam.object({
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })
  const text = {
    read: (value: { a: number, b: number }) => `${value.a}:${value.b}`,
    write: (value: string) => {
      const [a, b] = value.split(':').map(Number)
      return { a, b }
    },
  }

  it('derives an output default from an applicable static input default', () => {
    expect(range().transform(text).defaultValue).toBe('0:100')
  })

  it.each([
    ['own default before the gate', () => range().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent()],
    ['gate before the own default', () => range().withDefaultsWhenPresent().withDefault({ a: 0, b: 100 })],
  ])('derives no output default from a gated input with %s', (_name, build) => {
    expect(build().transform(text).defaultValue).toBeUndefined()
  })

  it('resolves explicit input against the gated static candidate before transforming', () => {
    const param = range().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent().transform(text)

    expect(param.read({})).toBeUndefined()
    expect(param.read({ b: '10' })).toBe('0:10')
  })

  it('does not call the transform without a decoded input', () => {
    const read = vi.fn(text.read)
    const param = range().transform({ ...text, read })
    read.mockClear()

    expect(param.read({})).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
  })

  it('replaces the derived default with an output default declared after the transform', () => {
    const param = range().transform(text).withDefault('7:7')

    expect(param.defaultValue).toBe('7:7')
    expect(param.read({ b: '10' })).toBe('0:10')
  })
})
