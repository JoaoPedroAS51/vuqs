import { describe, expect, it, vi } from 'vitest'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery } from '../../helpers/adapter'

describe('explicit values and default resolution', () => {
  const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

  function mount(initial: Parameters<typeof withTestQuery>[0]) {
    const { build } = withTestQuery(initial)
    return build(() => useQueryStates(schema).use(withRuntimeDefaults()))
  }

  it('omits an absent defaulted param from explicit values and resolves its default', () => {
    const q = mount({})
    expect(q.explicitValues).toEqual({})
    expect(q.values.page).toBe(1)
  })

  it('treats an invalid value as absent, not as its default', () => {
    const q = mount({ page: 'bad' })
    expect(q.explicitValues).toEqual({})
    expect(q.values.page).toBe(1)
  })

  it('a runtime default overrides a shadowed static default on invalid input', () => {
    const q = mount({ page: 'bad' })
    q.setDefaults({ page: 2 })

    expect(q.explicitValues).toEqual({})
    expect(q.defaults.page).toBe(2)
    expect(q.values.page).toBe(2)
  })

  it('keeps a valid value that differs from the default as an explicit value', () => {
    const q = mount({ page: '3' })
    expect(q.explicitValues).toEqual({ page: 3 })
    expect(q.values.page).toBe(3)
  })

  it('keeps a valid value equal to the default, when explicitly present, as an explicit value', () => {
    const q = mount({ page: '1' })
    expect(q.explicitValues).toEqual({ page: 1 })
    expect(q.values.page).toBe(1)
  })

  it('treats falsy-but-valid values as values, not absences', () => {
    const q = withTestQuery({ n: '0', flag: 'false' })
      .build(() => useQueryStates({
        n: queryParam('n', codecs.integer.withDefault(9)),
        flag: queryParam('flag', codecs.boolean.withDefault(true)),
      }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({ n: 0, flag: false })
  })
})

describe('explicit values through transforms, prefixes, and objects', () => {
  it('omits a param whose transform rejects a present value', () => {
    const positive = queryParam('n', codecs.integer.withDefault(1)).transform<number>({
      read: v => (v > 0 ? v : undefined),
      write: v => v,
    })
    const q = withTestQuery({ n: '-5' })
      .build(() => useQueryStates({ n: positive }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({})
    expect(q.values.n).toBe(1)
  })

  it('omits a nested object whose only present value is invalid and has no default', () => {
    const inner = queryParam.object('range', { from: queryParam('f', codecs.integer) })
    const q = withTestQuery({ range: { f: 'bad' } })
      .build(() => useQueryStates({ range: inner }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({})
  })

  it('omits a present object\'s missing child that has no default', () => {
    const pair = queryParam.object('pair', {
      a: queryParam('a', codecs.string),
      b: queryParam('b', codecs.string),
    })
    const q = withTestQuery({ pair: { a: 'x' } })
      .build(() => useQueryStates({ pair }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({ pair: { a: 'x' } })
    expect(q.values.pair).toEqual({ a: 'x' }) // `b` has no default, so it stays out
  })

  it('resolves child defaults without adding them to explicit values', () => {
    const range = queryParam
      .object('range', {
        from: queryParam('from', codecs.string.withDefault('A')),
        to: queryParam('to', codecs.string.withDefault('B')),
      })
      .withDefaultsWhenPresent()

    const q = withTestQuery({ range: { from: 'x' } })
      .build(() => useQueryStates({ range }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({ range: { from: 'x' } })
    expect(q.values.range).toEqual({ from: 'x', to: 'B' })
  })

  it('omits a present object with only an invalid child from explicit values and resolves its defaults', () => {
    const inner = queryParam.object('range', { from: queryParam('f', codecs.integer.withDefault(0)) })
    const q = withTestQuery({ range: { f: 'bad' } })
      .build(() => useQueryStates({ range: inner }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({}) // invalid child → no valid value
    expect(q.values.range).toEqual({ from: 0 }) // resolves to the child default
  })

  it('omits an absent withDefaultsWhenPresent object from explicit and resolved values', () => {
    const range = queryParam
      .object('range', {
        from: queryParam('from', codecs.string.withDefault('A')),
      })
      .withDefaultsWhenPresent()

    const q = withTestQuery({})
      .build(() => useQueryStates({ range }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({})
    expect(q.values.range).toBeUndefined()
  })

  it('resolves an object-level default for an absent object through the engine', () => {
    const range = queryParam
      .object('range', {
        from: queryParam('from', codecs.string),
        to: queryParam('to', codecs.string),
      })
      .withDefault({ from: 'A' })

    const q = withTestQuery({})
      .build(() => useQueryStates({ range }).use(withRuntimeDefaults()))

    expect(q.explicitValues).toEqual({})
    expect(q.values.range).toEqual({ from: 'A' })
  })
})

// A runtime default reaches a missing or invalid child of a partially present
// object. A partial runtime layer keeps sibling codec defaults.
describe('runtime defaults over object children', () => {
  const range = queryParam.object('range', {
    from: queryParam('from', codecs.integer.withDefault(0)),
    to: queryParam('to', codecs.integer.withDefault(0)),
  })

  function mount(initial: Parameters<typeof withTestQuery>[0]) {
    const { build } = withTestQuery(initial)
    return build(() => useQueryStates({ range }).use(withRuntimeDefaults()))
  }

  it('a runtime default fills a missing child of a present object', () => {
    const q = mount({ range: { to: '5' } })
    q.setDefaults({ range: { from: 99, to: 99 } })

    expect(q.explicitValues).toEqual({ range: { to: 5 } }) // pure
    expect(q.values.range).toEqual({ from: 99, to: 5 }) // runtime `from` wins the gap
  })

  it('falls back to the codec child default when no runtime default is set', () => {
    const q = mount({ range: { to: '5' } })

    expect(q.values.range).toEqual({ from: 0, to: 5 })
  })

  it('a runtime default overrides a child gap of a withDefaultsWhenPresent object', () => {
    const whenPresent = queryParam
      .object('range', {
        from: queryParam('from', codecs.integer.withDefault(0)),
        to: queryParam('to', codecs.integer.withDefault(0)),
      })
      .withDefaultsWhenPresent()
    const { build } = withTestQuery({ range: { to: '5' } })
    const q = build(() => useQueryStates({ range: whenPresent }).use(withRuntimeDefaults()))
    q.setDefaults({ range: { from: 99, to: 99 } })

    expect(q.values.range).toEqual({ from: 99, to: 5 })
  })

  it('does not materialize an absent withDefaultsWhenPresent object, even with a runtime default', () => {
    const whenPresent = queryParam
      .object('range', {
        from: queryParam('from', codecs.integer.withDefault(0)),
        to: queryParam('to', codecs.integer.withDefault(0)),
      })
      .withDefaultsWhenPresent()
    const { build } = withTestQuery({})
    const q = build(() => useQueryStates({ range: whenPresent }).use(withRuntimeDefaults()))
    q.setDefaults({ range: { from: 99, to: 99 } })

    // A runtime default is a layer, not the object's own default: it applies only
    // when the object is present, so an absent whenPresent object stays absent.
    expect(q.values.range).toBeUndefined()
  })

  it('keeps presence when writing a withDefaultsWhenPresent value equal to a runtime default', async () => {
    const whenPresent = queryParam
      .object('range', {
        from: queryParam('from', codecs.integer.withDefault(0)),
        to: queryParam('to', codecs.integer.withDefault(0)),
      })
      .withDefaultsWhenPresent()
    const test = withTestQuery({})
    const q = test.build(() => useQueryStates({ range: whenPresent }).use(withRuntimeDefaults()))
    q.setDefaults({ range: { from: 99, to: 99 } })

    q.patch({ range: { from: 99, to: 99 } })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(test.query.value).toEqual({ range: { from: '99', to: '99' } })
    expect(q.values.range).toEqual({ from: 99, to: 99 })
  })
})

describe('default mutation safety', () => {
  it('clones an absent object default so a mutation cannot corrupt the shared default', () => {
    const range = queryParam
      .object('range', { from: queryParam('from', codecs.integer), to: queryParam('to', codecs.integer) })
      .withDefault({ from: 1, to: 2 })

    const q1 = withTestQuery({}).build(() => useQueryStates({ range }))
    const first = q1.values.range as { from: number, to: number }
    first.from = 999 // mutate the value read from an absent-defaulted object

    const q2 = withTestQuery({}).build(() => useQueryStates({ range }))
    expect(q2.values.range).toEqual({ from: 1, to: 2 }) // the shared default is intact
  })
})

describe('transformed params and default sources', () => {
  const range = () => queryParam.object('range', {
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

  it.each([
    ['own default before the gate', () => range().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent()],
    ['gate before the own default', () => range().withDefaultsWhenPresent().withDefault({ a: 0, b: 100 })],
  ])('derives no output default from a gated input with %s', (_name, build) => {
    const absent = withTestQuery({})
      .build(() => useQueryStates({ text: build().transform(text) }).use(withRuntimeDefaults()))
    const present = withTestQuery({ range: { b: '10' } })
      .build(() => useQueryStates({ text: build().transform(text) }).use(withRuntimeDefaults()))

    expect(absent.explicitValues.text).toBeUndefined()
    expect(absent.values.text).toBeUndefined()
    expect(present.values.text).toBe('0:10')
  })

  it('keeps output defaults independent of the input gate and of the input object', () => {
    const param = range().withDefaultsWhenPresent().transform(text).withDefault('fallback')
    const q = withTestQuery({})
      .build(() => useQueryStates({ text: param }).use(withRuntimeDefaults()))

    expect(q.values.text).toBe('fallback')

    q.setDefaults({ text: 'runtime' })
    expect(q.values.text).toBe('runtime')

    q.clearDefaults()
    expect(q.values.text).toBe('fallback')
  })

  it('shadows a static output default with a runtime output default without running the input transform', () => {
    const read = vi.fn(text.read)
    const param = range().transform({ ...text, read }).withDefault('#99')
    const q = withTestQuery({})
      .build(() => useQueryStates({ text: param }).use(withRuntimeDefaults()))

    read.mockClear()
    q.setDefaults({ text: '#20' })

    expect(q.values.text).toBe('#20')
    expect(read).not.toHaveBeenCalled()
  })

  it('ends composition at an identity transform output', () => {
    const base = queryParam.object('range', {
      a: queryParam('a', codecs.integer.withDefault(1)),
      b: queryParam('b', codecs.integer.withDefault(100)),
    })
    const identity = base.transform({ read: value => value, write: value => value })
    const present = withTestQuery({ range: { b: '10' } })
      .build(() => useQueryStates({ range: identity }).use(withRuntimeDefaults()))
    const absent = withTestQuery({})
      .build(() => useQueryStates({ range: identity }).use(withRuntimeDefaults()))

    present.setDefaults({ range: { a: 5, b: 100 } })
    absent.setDefaults({ range: { a: 5, b: 100 } })

    expect(present.explicitValues.range).toEqual({ a: 1, b: 10 })
    expect(present.values.range).toEqual({ a: 1, b: 10 })
    expect(absent.values.range).toEqual({ a: 5, b: 100 })
  })

  it('lets an applicable output default resolve a rejected transform result', () => {
    const positive = queryParam('n', codecs.integer.withDefault(1))
      .transform<string>({ read: v => (v > 0 ? `#${v}` : undefined), write: v => Number(v.slice(1)) })
      .withDefault('fallback')
    const q = withTestQuery({ n: '0' })
      .build(() => useQueryStates({ n: positive }).use(withRuntimeDefaults()))

    expect(q.explicitValues.n).toBeUndefined()
    expect(q.values.n).toBe('fallback')
  })
})
