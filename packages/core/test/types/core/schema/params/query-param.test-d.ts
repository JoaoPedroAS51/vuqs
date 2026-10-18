import type { ExplicitValueOf, GuaranteedOf, ResolvedValueOf } from '../../../../../src/core/schema/params/builder-types'
import type { DefinedQueryParam, DefinedQueryParamWithDefault } from '../../../../../src/core/schema/params/definition'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryStates } from '../../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../../src/core/codecs/codec'
import { queryParam } from '../../../../../src/core/schema/params/query-param'

describe('queryParam inference', () => {
  it('carries scalar value types', () => {
    expectTypeOf(queryParam('q')).toExtend<DefinedQueryParam<string>>()
    expectTypeOf(queryParam('q', { defaultValue: '' })).toExtend<DefinedQueryParamWithDefault<string>>()
    expectTypeOf(queryParam('page', codecs.integer)).toExtend<DefinedQueryParam<number>>()
    expectTypeOf(queryParam('page', codecs.integer.withDefault(1))).toExtend<DefinedQueryParamWithDefault<number>>()
  })

  it('preserves custom codec contracts through builders and codec shorthand', () => {
    const codec = createCodec<{ value: number }>({
      parse: raw => typeof raw === 'number' ? { value: raw } : undefined,
      serialize: value => value.value,
    })
    const param = queryParam('built', codec)
    const defaulted = codec.withDefault({ value: 1 })
    const query = useQueryStates({
      built: param,
      ownDefault: queryParam('own', codec).withDefault({ value: 2 }),
      normalized: defaulted,
      nested: queryParam.object({ child: defaulted }),
    })

    expectTypeOf(param.read).returns.toEqualTypeOf<{ value: number } | undefined>()
    expectTypeOf(query.values.built).toEqualTypeOf<{ value: number } | undefined>()
    expectTypeOf(query.values.ownDefault).toEqualTypeOf<{ value: number }>()
    expectTypeOf(query.values.normalized).toEqualTypeOf<{ value: number }>()
    expectTypeOf(query.values.nested).toEqualTypeOf<{ child: { value: number } }>()
  })

  it('infers object values from children and child defaults', () => {
    const bounds = queryParam.object('bounds', {
      north: queryParam('n', codecs.float).withDefault(1),
      south: queryParam('s', codecs.float),
    })

    expectTypeOf(bounds).not.toBeAny()
    expectTypeOf<ResolvedValueOf<typeof bounds>>().toEqualTypeOf<{ north: number, south?: number }>()
    expectTypeOf<ExplicitValueOf<typeof bounds>>().toEqualTypeOf<{ north?: number, south?: number }>()
    expectTypeOf<GuaranteedOf<typeof bounds>>().toEqualTypeOf<true>()
  })

  it('infers object values from bare codec children', () => {
    const filter = queryParam.object({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    })

    expectTypeOf(filter).not.toBeAny()
    expectTypeOf<ResolvedValueOf<typeof filter>>().toEqualTypeOf<{ q?: string, page: number }>()
    expectTypeOf<ExplicitValueOf<typeof filter>>().toEqualTypeOf<{ q?: string, page?: number }>()
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

describe('object contribution and gate types', () => {
  const nested = queryParam.object({
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })

  it('accepts recursively partial static contributions through declared children', () => {
    const outer = queryParam.object({ nested }).withDefault({ nested: { a: 20 } })
    const prefixed = queryParam.object('p', outer).withDefault({ nested: { b: 5 } })
    const { values } = useQueryStates({ outer, prefixed })

    expectTypeOf(values.outer).toEqualTypeOf<{ nested: { a: number, b: number } }>()
    expectTypeOf(values.prefixed).toEqualTypeOf<{ nested: { a: number, b: number } }>()
  })

  it('rejects incomplete atomic children and invalid leaf values in static contributions', () => {
    const atomic = queryParam.object({
      payload: codecs.json<{ a: number, b: number }>(),
      list: codecs.json<Array<{ a: number, b: number }>>(),
    })

    // @ts-expect-error - a JSON child is atomic: `b` is required
    atomic.withDefault({ payload: { a: 1 } })
    // @ts-expect-error - array elements keep their required properties
    atomic.withDefault({ list: [{ a: 1 }] })
    // @ts-expect-error - a numeric child rejects text
    queryParam.object({ nested }).withDefault({ nested: { a: 'x' } })
  })

  it('keeps contribution inference through the object modifiers', () => {
    const modified = queryParam.object({ nested })
      .withEquality(() => true)
      .keepOnDefault()
      .withDefaultsWhenPresent()
      .withDefault({ nested: { a: 1 } })

    expectTypeOf(modified.withDefault).parameter(0).toEqualTypeOf<{ nested?: { a?: number, b?: number } }>()
  })

  it('does not make a nullable child nullable at the object level', () => {
    const nullable = queryParam.object({
      a: queryParam('a', codecs.integer.nullable().withDefault(null)),
    })
    const { values } = useQueryStates({ nullable })

    expectTypeOf(values.nullable).toEqualTypeOf<{ a: number | null }>()
    expectTypeOf(nullable).not.toHaveProperty('nullable')
    // @ts-expect-error - whole-object null is not a default
    nullable.withDefault(null)
    expectTypeOf(nullable.withDefault).parameter(0).toEqualTypeOf<{ a?: number | null }>()
  })

  it('rejects null defaults on a non-nullable scalar', () => {
    // @ts-expect-error - the integer codec does not accept null
    queryParam('n', codecs.integer).withDefault(null)
  })

  it('permits an absent gated object with an own default in either modifier order', () => {
    const own = queryParam.object({ a: queryParam('a', codecs.integer.withDefault(1)) }).withDefault({ a: 2 })
    const gatedAfter = own.withDefaultsWhenPresent()
    const gatedBefore = queryParam.object({ a: queryParam('a', codecs.integer.withDefault(1)) })
      .withDefaultsWhenPresent()
      .withDefault({ a: 2 })
    const { values } = useQueryStates({ gatedAfter, gatedBefore })

    expectTypeOf(values.gatedAfter).toEqualTypeOf<{ a: number } | undefined>()
    expectTypeOf(values.gatedBefore).toEqualTypeOf<{ a: number } | undefined>()
  })

  it('does not grant a parent presence from gated children candidates', () => {
    const gated = queryParam.object({ a: queryParam('a', codecs.integer.withDefault(1)) })
      .withDefault({ a: 2 })
      .withDefaultsWhenPresent()
    const parent = queryParam.object({ gated })
    const { values } = useQueryStates({ parent })

    expectTypeOf(values.parent).toEqualTypeOf<{ gated?: { a: number } } | undefined>()
  })

  it('does not inherit a transform input guarantee, and an output default establishes one', () => {
    const rejecting = queryParam('n', codecs.integer.withDefault(1))
      .transform<string>({ read: v => (v > 0 ? `#${v}` : undefined), write: v => Number(v.slice(1)) })
    const { values } = useQueryStates({ rejecting, defaulted: rejecting.withDefault('#9') })

    expectTypeOf(values.rejecting).toEqualTypeOf<string | undefined>()
    expectTypeOf(values.defaulted).toEqualTypeOf<string>()
  })

  it('types equality arguments with the explicit value domain', () => {
    nested.withEquality((x, y) => {
      expectTypeOf(x.a).toEqualTypeOf<number | undefined>()
      expectTypeOf(y.b).toEqualTypeOf<number | undefined>()
      return true
    })
    // @ts-expect-error - a defaulted child can be omitted from an explicit value
    nested.withEquality((x, y) => x.a + y.a === 0)
    nested.withEquality((x, y) => (x.a ?? 0) + (y.a ?? 0) === 0)
    expectTypeOf(nested.eq).parameter(0).toEqualTypeOf<{ a?: number, b?: number }>()
  })

  it('keeps atomic equality requirements and supported null', () => {
    const payload = queryParam('p', codecs.json<{ a: number, b: number }>())
    const nullable = queryParam('n', codecs.integer.nullable())

    payload.withEquality((x, y) => {
      expectTypeOf(x).toEqualTypeOf<{ a: number, b: number }>()
      return x.a === y.a
    })
    nullable.withEquality((x, y) => {
      expectTypeOf(x).toEqualTypeOf<number | null>()
      return x === y
    })
  })
})
