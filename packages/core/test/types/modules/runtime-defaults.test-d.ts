import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults/module'

describe('withRuntimeDefaults inference', () => {
  it('adds single runtime-default APIs to useQueryState', () => {
    const q = useQueryState('q').use(withRuntimeDefaults())

    expectTypeOf(q.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.explicitValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.defaultValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.setDefault).parameter(0).toEqualTypeOf<string>()
    expectTypeOf(q.clearDefault).toBeFunction()
    expectTypeOf(q).not.toHaveProperty('setDefaults')
  })

  it('types single runtime defaults for defaulted and composite params', () => {
    const page = useQueryState('page', codecs.integer.withDefault(1)).use(withRuntimeDefaults())

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.defaultValue.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(page.setDefault).parameter(0).toEqualTypeOf<number>()

    const rangeParam = queryParam.object({
      from: queryParam('from', codecs.string),
      to: queryParam('to', codecs.string),
    }).transform({
      read(value): { from: string, to: string } | undefined {
        return value.from && value.to ? { from: value.from, to: value.to } : undefined
      },
      write: value => value,
    })
    const range = useQueryState(rangeParam).use(withRuntimeDefaults())

    expectTypeOf(range.value).toEqualTypeOf<{ from: string, to: string } | undefined>()
    expectTypeOf(range.explicitValue.value).toEqualTypeOf<{ from: string, to: string } | undefined>()
    expectTypeOf(range.setDefault).parameter(0).toEqualTypeOf<{ from: string, to: string }>()
  })
})

describe('withRuntimeDefaults composed contribution inference', () => {
  const record = queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })

  it('accepts the same partial contribution in grouped and single setters', () => {
    const grouped = useQueryStates({ record }).use(withRuntimeDefaults())
    const single = useQueryState(record).use(withRuntimeDefaults())

    grouped.setDefaults({ record: { a: 10 } })
    grouped.setDefaults({ record: {} })
    single.setDefault({ a: 10 })
    single.setDefault({})
    expectTypeOf(single.setDefault).parameter(0).toEqualTypeOf<{ a?: number, b?: number }>()

    // @ts-expect-error - numeric child
    grouped.setDefaults({ record: { a: 'x' } })
    // @ts-expect-error - numeric child
    single.setDefault({ a: 'x' })
    // @ts-expect-error - whole-object null
    single.setDefault(null)
  })

  it('keeps explicit children optional and resolved children required', () => {
    const grouped = useQueryStates({ record }).use(withRuntimeDefaults())
    const single = useQueryState(record).use(withRuntimeDefaults())

    expectTypeOf(grouped.explicitValues.record).toEqualTypeOf<{ a?: number, b?: number } | undefined>()
    expectTypeOf(grouped.values.record).toEqualTypeOf<{ a: number, b: number }>()
    expectTypeOf(single.explicitValue.value).toEqualTypeOf<{ a?: number, b?: number } | undefined>()
    expectTypeOf(single.value).toEqualTypeOf<{ a: number, b: number }>()
  })

  it('rejects incomplete atomic contributions', () => {
    const atomic = queryParam.object('atomic', { payload: codecs.json<{ a: number, b: number }>() })
    const grouped = useQueryStates({ atomic }).use(withRuntimeDefaults())

    // @ts-expect-error - a JSON child is atomic: `b` is required
    grouped.setDefaults({ atomic: { payload: { a: 1 } } })
    grouped.setDefaults({ atomic: { payload: { a: 1, b: 2 } } })
  })

  it('does not narrow the declared read through a runtime contribution', () => {
    const grouped = useQueryStates({ n: codecs.integer }).use(withRuntimeDefaults())

    grouped.setDefaults({ n: 5 })
    expectTypeOf(grouped.values.n).toEqualTypeOf<number | undefined>()
  })
})

describe('withRuntimeDefaults lookalike value shapes', () => {
  it('only lets a composed object omit required properties from a contribution', () => {
    const composed = queryParam.object('composed', {
      a: queryParam('a', codecs.integer.withDefault(0)),
      b: queryParam('b', codecs.integer.withDefault(100)),
    })
    const json = queryParam('json', codecs.json<{ a: number, b: number }>())
    const transformed = queryParam('t', codecs.integer).transform<{ a: number, b: number }>({
      read: value => ({ a: value, b: value }),
      write: value => value.a,
    })
    const grouped = useQueryStates({ composed, json, transformed }).use(withRuntimeDefaults())
    const singles = {
      composed: useQueryState(composed).use(withRuntimeDefaults()),
      json: useQueryState(json).use(withRuntimeDefaults()),
      transformed: useQueryState(transformed).use(withRuntimeDefaults()),
    }

    grouped.setDefaults({ composed: { a: 1 } })
    singles.composed.setDefault({ a: 1 })
    // @ts-expect-error - a JSON value is atomic
    grouped.setDefaults({ json: { a: 1 } })
    // @ts-expect-error - a transformed output is atomic
    grouped.setDefaults({ transformed: { a: 1 } })
    // @ts-expect-error - a JSON value is atomic
    singles.json.setDefault({ a: 1 })
    // @ts-expect-error - a transformed output is atomic
    singles.transformed.setDefault({ a: 1 })
  })

  it('keeps contribution inference through prefixes and object modifiers in single state', () => {
    const point = queryParam.object({
      lat: queryParam('lat', codecs.float.withDefault(0)),
      lng: queryParam('lng', codecs.float.withDefault(0)),
    })
    const prefixed = queryParam.object('ne', point).keepOnDefault().withEquality(() => true)
    const single = useQueryState(prefixed).use(withRuntimeDefaults())

    single.setDefault({ lat: 5 })
    expectTypeOf(single.setDefault).parameter(0).toEqualTypeOf<{ lat?: number, lng?: number }>()
  })
})
