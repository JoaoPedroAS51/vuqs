import { describe, expect, it } from 'vitest'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createStaticOmissionEvaluator, dropDefaults, prepareDefaultOmission, readsEquivalent } from '../../../../src/core/schema/default-elision'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../../src/modules/runtime-defaults'
import { withTestQuery } from '../../../helpers/adapter'

describe('dropDefaults', () => {
  const withDefault = {
    page: queryParam('page', codecs.integer.withDefault(1)),
    q: queryParam('q', codecs.string),
  }

  it('drops a value equal to its default', () => {
    expect(dropDefaults(withDefault, { page: 1, q: 'phone' })).toEqual({ q: 'phone' })
  })

  it('keeps a value that differs from its default', () => {
    expect(dropDefaults(withDefault, { page: 2 })).toEqual({ page: 2 })
  })

  it('drops absent fields and keeps fields without a default', () => {
    expect(dropDefaults(withDefault, { page: undefined, q: 'phone' })).toEqual({ q: 'phone' })
  })

  describe('composed defaults and presence gates', () => {
    const range = () => queryParam.object('range', {
      a: queryParam('a', codecs.integer.withDefault(0)),
      b: queryParam('b', codecs.integer.withDefault(100)),
    })

    it('drops a complete value equal to the composed default', () => {
      expect(dropDefaults({ range: range() }, { range: { a: 0, b: 100 } })).toEqual({})
    })

    it('keeps the retained explicit value instead of materializing defaults', () => {
      const object = queryParam.object('record', {
        a: queryParam('a', codecs.integer),
        b: queryParam('b', codecs.integer),
      }).withDefault({ a: 0, b: 10 })

      expect(dropDefaults({ record: object }, { record: { b: 10 } })).toEqual({ record: { b: 10 } })
    })

    it.each([
      ['own default before the gate', () => range().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent()],
      ['gate before the own default', () => range().withDefaultsWhenPresent().withDefault({ a: 0, b: 100 })],
      ['gate without an own default', () => range().withDefaultsWhenPresent()],
    ])('keeps a gated object equal to its candidates with %s', (_name, build) => {
      expect(dropDefaults({ range: build() }, { range: { a: 0, b: 100 } })).toEqual({ range: { a: 0, b: 100 } })
    })

    it('keeps an ungated parent whose gated descendant omission would hide the descendant', () => {
      const child = queryParam.object('child', {
        a: queryParam('a', codecs.integer.withDefault(1)),
      }).withDefaultsWhenPresent()
      const parent = queryParam.object('parent', { child })

      expect(dropDefaults({ parent }, { parent: { child: { a: 1 } } })).toEqual({ parent: { child: { a: 1 } } })
    })
  })
})

describe('dropDefaults static source scope', () => {
  it('compares against static defaults only, ignoring runtime defaults registered by a binding', () => {
    const { build } = withTestQuery()
    const page = queryParam('page', codecs.integer.withDefault(1))
    const binding = build(() => useQueryStates({ page }).use(withRuntimeDefaults()))
    binding.setDefaults({ page: 5 })

    expect(dropDefaults({ page }, { page: 5 })).toEqual({ page: 5 })
    expect(dropDefaults({ page }, { page: 1 })).toEqual({})
  })
})

describe('readsEquivalent', () => {
  const schema = {
    a: queryParam('a', codecs.integer),
    b: queryParam('b', codecs.integer).withEquality((x, y) => Math.round(x / 10) === Math.round(y / 10)),
  }

  it('compares defined values with the param equality', () => {
    expect(readsEquivalent(schema, { a: 1, b: 11 }, { a: 1, b: 14 })).toBe(true)
    expect(readsEquivalent(schema, { a: 1, b: 11 }, { a: 2, b: 11 })).toBe(false)
  })

  it('distinguishes absence from every defined value without calling equality', () => {
    expect(readsEquivalent(schema, { a: 1 }, { a: 1 })).toBe(true)
    expect(readsEquivalent(schema, { a: 1 }, {})).toBe(false)
    expect(readsEquivalent(schema, {}, { a: 0 })).toBe(false)
  })
})

describe('prepareDefaultOmission', () => {
  const schema = {
    page: queryParam('page', codecs.integer.withDefault(1)),
    q: queryParam('q', codecs.string),
  }
  const evaluator = createStaticOmissionEvaluator(schema)

  it('omits default-equal representations and keeps unmanaged siblings', () => {
    expect(prepareDefaultOmission(schema, ['page'], { page: '1', keep: 'me' }, evaluator)).toEqual({
      keys: ['page'],
      query: { keep: 'me' },
    })
  })

  it('does nothing without a qualifying key', () => {
    expect(prepareDefaultOmission(schema, [], { page: '1' }, evaluator)).toBeUndefined()
    expect(prepareDefaultOmission(schema, ['page', 'q'], { page: '2', q: 'x' }, evaluator)).toBeUndefined()
  })

  it('keeps a representation when the alternative read differs', () => {
    const gated = queryParam.object('range', {
      a: queryParam('a', codecs.integer.withDefault(0)),
    }).withDefaultsWhenPresent()

    expect(prepareDefaultOmission({ gated }, ['gated'], { range: { a: '0' } }, createStaticOmissionEvaluator({ gated }))).toBeUndefined()
  })

  it('compares the complete read, so an unsafe combination keeps every omission', () => {
    const a = queryParam.object('a', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
    const b = queryParam.object('b', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
    const both = { a, b }
    const fill: ReturnType<typeof createStaticOmissionEvaluator> = {
      ...createStaticOmissionEvaluator(both),
      resolved(query) {
        const base = createStaticOmissionEvaluator(both).resolved(query)
        const filler = base.a ?? base.b

        return filler === undefined ? base : { a: filler, b: filler }
      },
    }

    expect(prepareDefaultOmission(both, ['a'], { a: { n: '1' }, b: { n: '1' } }, fill)).toEqual({
      keys: ['a'],
      query: { b: { n: '1' } },
    })
    expect(prepareDefaultOmission(both, ['a', 'b'], { a: { n: '1' }, b: { n: '1' } }, fill)).toBeUndefined()
  })
})
