import { describe, expect, it } from 'vitest'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery } from '../../helpers/adapter'

function gatedRange() {
  return queryParam.object('range', {
    min: codecs.integer.withDefault(0),
    max: codecs.integer,
  })
}

describe('nested object default resolution', () => {
  it('resolves a present child object without filling its explicit values', () => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', { min: codecs.integer.withDefault(0), max: codecs.integer }),
    })
    const test = withTestQuery({ filters: { range: { max: '10' } } })
    const q = test.build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.explicitValues.filters).toEqual({ range: { max: 10 } })
    expect(q.values.filters).toEqual({ range: { min: 0, max: 10 } })
    expect(test.query.value).toEqual({ filters: { range: { max: '10' } } })
  })

  it('resolves defaults through multiple prefixed object levels', () => {
    const range = queryParam.object({ min: codecs.integer.withDefault(0), max: codecs.integer })
    const filters = queryParam.object('filters', {
      limits: queryParam.object('limits', { range: queryParam.object('range', range) }),
    })
    const q = withTestQuery({ filters: { limits: { range: { max: '10' } } } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.explicitValues.filters).toEqual({ limits: { range: { max: 10 } } })
    expect(q.values.filters).toEqual({ limits: { range: { min: 0, max: 10 } } })
  })

  it('keeps explicit values above runtime and static child defaults', () => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', {
        min: codecs.integer.withDefault(0),
        max: codecs.integer,
        step: codecs.integer,
      }).withDefault({ min: 5, step: 2 }),
    })
    const q = withTestQuery({ filters: { range: { max: '10' } } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.values.filters).toEqual({ range: { min: 5, max: 10, step: 2 } })
    q.setDefaults({ filters: { range: { min: 99, max: 20 } } })
    expect(q.explicitValues.filters).toEqual({ range: { max: 10 } })
    expect(q.values.filters).toEqual({ range: { min: 99, max: 10, step: 2 } })
  })

  it('resolves a present gated child and preserves an absent gated child', () => {
    const filters = queryParam.object('filters', {
      q: codecs.string,
      range: queryParam.object('range', {
        min: codecs.integer.withDefault(0),
        max: codecs.integer,
      }).withDefaultsWhenPresent(),
    })
    const present = withTestQuery({ filters: { range: { max: '10' } } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))
    const absent = withTestQuery({ filters: { q: 'phone' } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    present.setDefaults({ filters: { range: { min: 99 } } })
    absent.setDefaults({ filters: { range: { min: 99 } } })

    expect(present.explicitValues.filters).toEqual({ range: { max: 10 } })
    expect(present.values.filters).toEqual({ range: { min: 99, max: 10 } })
    expect(absent.explicitValues.filters).toEqual({ q: 'phone' })
    expect(absent.values.filters).toEqual({ q: 'phone' })
  })

  it('keeps an absent gated child with its own default absent', () => {
    const filters = queryParam.object('filters', {
      q: codecs.string,
      range: queryParam.object('range', {
        min: codecs.integer.withDefault(0),
        max: codecs.integer,
      }).withDefault({ max: 10 }).withDefaultsWhenPresent(),
    })
    const q = withTestQuery({ filters: { q: 'phone' } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.explicitValues.filters).toEqual({ q: 'phone' })
    expect(q.values.filters).toEqual({ q: 'phone' })
  })

  it.each([
    ['own default before the gate', (range: ReturnType<typeof gatedRange>) => range.withDefault({ max: 10 }).withDefaultsWhenPresent()],
    ['gate before the own default', (range: ReturnType<typeof gatedRange>) => range.withDefaultsWhenPresent().withDefault({ max: 10 })],
  ])('resolves a present gated child against its own default with %s', (_name, modify) => {
    const filters = queryParam.object('filters', { q: codecs.string, range: modify(gatedRange()) })
    const q = withTestQuery({ filters: { range: { min: '3' } } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.explicitValues.filters).toEqual({ range: { min: 3 } })
    expect(q.values.filters).toEqual({ range: { min: 3, max: 10 } })
  })

  it('resolves default gaps below a transformed object', () => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', { min: codecs.integer.withDefault(0), max: codecs.integer }),
    }).transform({ read: value => value, write: value => value })
    const q = withTestQuery({ filters: { range: { max: '10' } } })
      .build(() => useQueryStates({ filters }))

    expect(q.values.filters).toEqual({ range: { min: 0, max: 10 } })
  })

  it.each([false, true])('preserves default-valued write policy with keepOnDefault %s', async (keep) => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', { min: codecs.integer.withDefault(0) }),
    })
    const test = withTestQuery({})
    const q = test.build(() => useQueryStates({ filters: keep ? filters.keepOnDefault() : filters }))

    q.patch({ filters: { range: { min: 0 } } })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(test.query.value).toEqual(keep ? { filters: { range: { min: '0' } } } : {})
    expect(q.values.filters).toEqual({ range: { min: 0 } })
  })
})

describe('layered runtime defaults over static defaults', () => {
  const record = () => queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer),
    c: queryParam('c', codecs.integer.withDefault(2)),
  })

  it('fills omitted children of a partial runtime default from static defaults', () => {
    const q = withTestQuery({})
      .build(() => useQueryStates({ record: record() }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { a: 99 } })

    expect(q.explicitValues.record).toBeUndefined()
    expect(q.values.record).toEqual({ a: 99, c: 2 })
    expect(q.defaults.record).toEqual({ a: 99, c: 2 })
  })

  it('resolves a present object over the composed runtime and static defaults', () => {
    const test = withTestQuery({ record: { b: '10' } })
    const q = test.build(() => useQueryStates({ record: record() }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { a: 99 } })

    expect(q.explicitValues.record).toEqual({ b: 10 })
    expect(q.values.record).toEqual({ a: 99, b: 10, c: 2 })
    expect(test.query.value).toEqual({ record: { b: '10' } })
  })

  it('replaces the runtime contribution on every setDefaults call', () => {
    const q = withTestQuery({})
      .build(() => useQueryStates({ record: record() }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { a: 99, b: 20 } })
    expect(q.values.record).toEqual({ a: 99, b: 20, c: 2 })

    q.setDefaults({ record: { b: 30 } })
    expect(q.values.record).toEqual({ a: 0, b: 30, c: 2 })

    q.clearDefaults()
    expect(q.values.record).toEqual({ a: 0, c: 2 })
  })

  it('lets an object static default override child defaults beneath the runtime contribution', () => {
    const object = queryParam.object('record', {
      a: queryParam('a', codecs.integer.withDefault(0)),
      b: queryParam('b', codecs.integer),
      c: queryParam('c', codecs.integer),
    }).withDefault({ a: 5, c: 2 })
    const q = withTestQuery({})
      .build(() => useQueryStates({ record: object }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { b: 20 } })

    expect(q.values.record).toEqual({ a: 5, b: 20, c: 2 })
  })

  it('applies the full precedence per child across explicit, runtime and static sources', () => {
    const nested = queryParam.object('nested', {
      a: queryParam('a', codecs.integer.withDefault(20)),
      b: queryParam('b', codecs.integer),
    }).withDefault({ a: 10 })
    const outer = queryParam.object('outer', { nested }).withDefault({ nested: { a: 0, b: 100 } })
    const q = withTestQuery({ outer: { nested: { a: '40' } } })
      .build(() => useQueryStates({ outer }).use(withRuntimeDefaults()))

    q.setDefaults({ outer: { nested: { a: 30 } } })
    expect(q.values.outer).toEqual({ nested: { a: 40, b: 100 } })

    q.patch({ outer: undefined })
    expect(q.values.outer).toEqual({ nested: { a: 30, b: 100 } })

    q.clearDefaults()
    expect(q.values.outer).toEqual({ nested: { a: 0, b: 100 } })
  })

  it('treats undefined as no contribution and a supported null as a defined override', () => {
    const object = queryParam.object('record', {
      a: queryParam('a', codecs.integer.nullable().withDefault(2)),
      b: queryParam('b', codecs.integer),
    })
    const q = withTestQuery({})
      .build(() => useQueryStates({ record: object }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { a: undefined } })
    expect(q.values.record).toEqual({ a: 2 })

    q.setDefaults({ record: { a: null } })
    expect(q.values.record).toEqual({ a: null })
  })

  it('keeps a nullable runtime default when another child is explicit', () => {
    const object = queryParam.object('record', {
      a: queryParam('a', codecs.integer.nullable().withDefault(2)),
      b: queryParam('b', codecs.integer),
    })
    const q = withTestQuery({ record: { b: '5' } })
      .build(() => useQueryStates({ record: object }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { a: null } })

    expect(q.values.record).toEqual({ a: null, b: 5 })
  })

  it('does not let a mutated resolved result corrupt the registered defaults', () => {
    const test = withTestQuery({})
    const q = test.build(() => useQueryStates({ record: record() }).use(withRuntimeDefaults()))

    q.setDefaults({ record: { a: 99 } })
    ;(q.values.record as { a: number }).a = -1

    test.query.value = { record: { b: '1' } }

    expect(q.values.record).toEqual({ a: 99, b: 1, c: 2 })
  })
})

describe('gated candidates and direct contributions', () => {
  const gatedRecord = () => queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(1)),
    b: queryParam('b', codecs.integer),
  }).withDefaultsWhenPresent()

  it('keeps an ungated container absent when only a gated child supplies candidates', () => {
    const container = queryParam.object('container', { record: gatedRecord() })
    const q = withTestQuery({})
      .build(() => useQueryStates({ container }).use(withRuntimeDefaults()))

    expect(q.values.container).toBeUndefined()
    expect(q.defaults.container).toEqual({ record: { a: 1 } })
  })

  it('resolves an empty own contribution to an object without activating the gated child', () => {
    const container = queryParam.object('container', { record: gatedRecord() }).withDefault({})
    const q = withTestQuery({})
      .build(() => useQueryStates({ container }).use(withRuntimeDefaults()))

    expect(q.values.container).toEqual({})
    expect(q.defaults.container).toEqual({ record: { a: 1 } })
  })

  it('resolves an empty runtime contribution to an object and restores absence when removed', () => {
    const container = queryParam.object('container', { record: gatedRecord() })
    const q = withTestQuery({})
      .build(() => useQueryStates({ container }).use(withRuntimeDefaults()))

    q.setDefaults({ container: {} })
    expect(q.values.container).toEqual({})

    q.clearDefaults()
    expect(q.values.container).toBeUndefined()
  })

  it('resolves an empty enclosing contribution to an object without activating the gated child', () => {
    const container = queryParam.object('container', { record: gatedRecord() })
    const outer = queryParam.object('outer', { container }).withDefault({ container: {} })
    const q = withTestQuery({})
      .build(() => useQueryStates({ outer }).use(withRuntimeDefaults()))

    expect(q.values.outer).toEqual({ container: {} })
  })

  it('never lets a direct contribution bypass the object own gate', () => {
    const container = queryParam.object('container', {
      a: queryParam('a', codecs.integer),
    }).withDefaultsWhenPresent().withDefault({})
    const q = withTestQuery({})
      .build(() => useQueryStates({ container }).use(withRuntimeDefaults()))

    expect(q.values.container).toBeUndefined()

    q.setDefaults({ container: {} })
    expect(q.values.container).toBeUndefined()
  })

  it('does not let a parent presence enable an absent gated child', () => {
    const container = queryParam.object('container', {
      text: codecs.string,
      record: gatedRecord(),
    })
    const q = withTestQuery({ container: { text: 'x' } })
      .build(() => useQueryStates({ container }).use(withRuntimeDefaults()))

    q.setDefaults({ container: { record: { a: 9 } } })

    expect(q.values.container).toEqual({ text: 'x' })
  })

  it('keeps an enclosing override subject to the child gate', () => {
    const container = queryParam.object('container', { record: gatedRecord() })
      .withDefault({ record: { a: 9 } })
    const absent = withTestQuery({}).build(() => useQueryStates({ container }).use(withRuntimeDefaults()))
    const present = withTestQuery({ container: { record: { b: '10' } } })
      .build(() => useQueryStates({ container }).use(withRuntimeDefaults()))

    expect(absent.values.container).toEqual({})
    expect(present.values.container).toEqual({ record: { a: 9, b: 10 } })
  })

  it.each([
    ['missing', {}],
    ['invalid-only', { record: { a: 'x' } }],
  ])('does not activate a gated object with %s input and non-empty candidates', (_name, query) => {
    const q = withTestQuery(query)
      .build(() => useQueryStates({ record: gatedRecord().withDefault({ a: 3 }) }).use(withRuntimeDefaults()))

    expect(q.values.record).toBeUndefined()
  })

  it('creates no empty object from an object without any default source', () => {
    const object = queryParam.object('record', {
      a: queryParam('a', codecs.integer),
      b: queryParam('b', codecs.integer),
    })
    const q = withTestQuery({ record: { a: 'x', b: 'y' } })
      .build(() => useQueryStates({ record: object }).use(withRuntimeDefaults()))

    expect(q.values.record).toBeUndefined()
  })
})
