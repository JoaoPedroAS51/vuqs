import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { useQueryStates } from '../../src/core/use-query-states'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'
import { withTestQuery } from '../helpers/adapter'

// An absent or invalid value must behave as "no selection", at every level: its
// default is resolved by the engine's default layer, never leaked into `selected`.
// `selected` is a pure URL selection (including a present object's children);
// `values` is the selection composed over the resolved (layered) default.
describe('selection vs default resolution', () => {
  const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

  function mount(initial: Parameters<typeof withTestQuery>[0]) {
    const { build } = withTestQuery(initial)
    return build(() => useQueryStates(schema).use(withRuntimeDefaults()))
  }

  it('omits an absent defaulted param from the selection, resolves the default', () => {
    const q = mount({})
    expect(q.selected).toEqual({})
    expect(q.values.page).toBe(1)
  })

  it('treats an invalid value as absent, not as its default', () => {
    const q = mount({ page: 'bad' })
    expect(q.selected).toEqual({})
    expect(q.values.page).toBe(1)
  })

  it('lets a runtime default win over a shadowed static default on invalid input', () => {
    const q = mount({ page: 'bad' })
    q.setDefaults({ page: 2 })

    expect(q.selected).toEqual({})
    expect(q.defaults.page).toBe(2)
    expect(q.values.page).toBe(2)
  })

  it('keeps a valid value that differs from the default as a selection', () => {
    const q = mount({ page: '3' })
    expect(q.selected).toEqual({ page: 3 })
    expect(q.values.page).toBe(3)
  })

  it('keeps a valid value equal to the default, when explicitly present, as a selection', () => {
    const q = mount({ page: '1' })
    expect(q.selected).toEqual({ page: 1 })
    expect(q.values.page).toBe(1)
  })

  it('treats falsy-but-valid values as selections, not absences', () => {
    const q = withTestQuery({ n: '0', flag: 'false' })
      .build(() => useQueryStates({
        n: queryParam('n', codecs.integer.withDefault(9)),
        flag: queryParam('flag', codecs.boolean.withDefault(true)),
      }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({ n: 0, flag: false })
  })
})

describe('selection through transforms, prefixes, and objects', () => {
  it('omits a param whose transform rejects a present value', () => {
    const positive = queryParam('n', codecs.integer.withDefault(1)).transform<number>({
      read: v => (v > 0 ? v : undefined),
      write: v => v,
    })
    const q = withTestQuery({ n: '-5' })
      .build(() => useQueryStates({ n: positive }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({})
    expect(q.values.n).toBe(1)
  })

  it('omits a nested object whose only present value is invalid and has no default', () => {
    const inner = queryParam.object('range', { from: queryParam('f', codecs.integer) })
    const q = withTestQuery({ range: { f: 'bad' } })
      .build(() => useQueryStates({ range: inner }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({})
  })

  it('omits a present object\'s missing child that has no default', () => {
    const pair = queryParam.object('pair', {
      a: queryParam('a', codecs.string),
      b: queryParam('b', codecs.string),
    })
    const q = withTestQuery({ pair: { a: 'x' } })
      .build(() => useQueryStates({ pair }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({ pair: { a: 'x' } })
    expect(q.values.pair).toEqual({ a: 'x' }) // `b` has no default, so it stays out
  })

  it('keeps a present object\'s selection pure; child defaults resolve in values', () => {
    const range = queryParam
      .object('range', {
        from: queryParam('from', codecs.string.withDefault('A')),
        to: queryParam('to', codecs.string.withDefault('B')),
      })
      .withDefaultsWhenPresent()

    const q = withTestQuery({ range: { from: 'x' } })
      .build(() => useQueryStates({ range }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({ range: { from: 'x' } }) // pure selection (DP1b)
    expect(q.values.range).toEqual({ from: 'x', to: 'B' }) // child when-present default in values
  })

  it('omits a present object with only an invalid child from selection, resolves in values', () => {
    const inner = queryParam.object('range', { from: queryParam('f', codecs.integer.withDefault(0)) })
    const q = withTestQuery({ range: { f: 'bad' } })
      .build(() => useQueryStates({ range: inner }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({}) // invalid child → no valid selection
    expect(q.values.range).toEqual({ from: 0 }) // resolves to the child default
  })

  it('omits an absent withDefaultsWhenPresent object from selection and values', () => {
    const range = queryParam
      .object('range', {
        from: queryParam('from', codecs.string.withDefault('A')),
      })
      .withDefaultsWhenPresent()

    const q = withTestQuery({})
      .build(() => useQueryStates({ range }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({})
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

    expect(q.selected).toEqual({})
    expect(q.values.range).toEqual({ from: 'A' })
  })
})

// The fix: a runtime default reaches a missing/invalid child of a partially-present
// object, and a partial runtime layer keeps sibling codec defaults.
describe('runtime defaults over object children', () => {
  const range = queryParam.object('range', {
    from: queryParam('from', codecs.integer.withDefault(0)),
    to: queryParam('to', codecs.integer.withDefault(0)),
  })

  function mount(initial: Parameters<typeof withTestQuery>[0]) {
    const { build } = withTestQuery(initial)
    return build(() => useQueryStates({ range }).use(withRuntimeDefaults()))
  }

  it('lets a runtime default fill a missing child of a present object', () => {
    const q = mount({ range: { to: '5' } })
    q.setDefaults({ range: { from: 99, to: 99 } })

    expect(q.selected).toEqual({ range: { to: 5 } }) // pure
    expect(q.values.range).toEqual({ from: 99, to: 5 }) // runtime `from` wins the gap
  })

  it('falls back to the codec child default when no runtime default is set', () => {
    const q = mount({ range: { to: '5' } })

    expect(q.values.range).toEqual({ from: 0, to: 5 })
  })

  it('lets a runtime default override a child gap of a withDefaultsWhenPresent object', () => {
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
