import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { useQueryStates } from '../../src/core/use-query-states'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'
import { withTestQuery } from '../helpers/adapter'

// An absent or invalid top-level param must behave as "no selection": its default
// is resolved by the engine's default layer, not leaked into `selected`. A present
// object is the documented exception: it fills its own children's when-present
// defaults, which are part of a present object's selection (see the object tests).
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

  it('fills a present object\'s invalid child from its when-present default', () => {
    const inner = queryParam.object('range', { from: queryParam('f', codecs.integer.withDefault(0)) })
    const q = withTestQuery({ range: { f: 'bad' } })
      .build(() => useQueryStates({ range: inner }).use(withRuntimeDefaults()))

    // The object is present (a path holds a raw value), so its invalid child
    // resolves to the child's when-present default: a present object materializes.
    expect(q.selected).toEqual({ range: { from: 0 } })
  })

  it('keeps child-when-present defaults in the selection of a present object', () => {
    const range = queryParam
      .object('range', {
        from: queryParam('from', codecs.string.withDefault('A')),
        to: queryParam('to', codecs.string.withDefault('B')),
      })
      .withDefaultsWhenPresent()

    const q = withTestQuery({ range: { from: 'x' } })
      .build(() => useQueryStates({ range }).use(withRuntimeDefaults()))

    expect(q.selected).toEqual({ range: { from: 'x', to: 'B' } })
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
