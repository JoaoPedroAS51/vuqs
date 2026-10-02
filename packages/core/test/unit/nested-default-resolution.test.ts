import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { useQueryStates } from '../../src/core/use-query-states'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'
import { withTestQuery } from '../helpers/adapter'

describe('nested object default resolution', () => {
  it('resolves a selected child object without filling its selection', () => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', { min: codecs.integer.withDefault(0), max: codecs.integer }),
    })
    const test = withTestQuery({ filters: { range: { max: '10' } } })
    const q = test.build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.selected.filters).toEqual({ range: { max: 10 } })
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

    expect(q.selected.filters).toEqual({ limits: { range: { max: 10 } } })
    expect(q.values.filters).toEqual({ limits: { range: { min: 0, max: 10 } } })
  })

  it('keeps selection above runtime and static child defaults', () => {
    const filters = queryParam.object('filters', {
      range: queryParam.object('range', {
        min: codecs.integer.withDefault(0),
        max: codecs.integer,
        step: codecs.integer,
      }).withDefault({ min: 5, step: 2 }),
    })
    const q = withTestQuery({ filters: { range: { max: '10' } } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.values.filters).toEqual({ range: { min: 0, max: 10, step: 2 } })
    q.setDefaults({ filters: { range: { min: 99, max: 20 } } })
    expect(q.selected.filters).toEqual({ range: { max: 10 } })
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

    expect(present.selected.filters).toEqual({ range: { max: 10 } })
    expect(present.values.filters).toEqual({ range: { min: 99, max: 10 } })
    expect(absent.selected.filters).toEqual({ q: 'phone' })
    expect(absent.values.filters).toEqual({ q: 'phone' })
  })

  it('keeps an absent child with its own default resolved under presence gating', () => {
    const filters = queryParam.object('filters', {
      q: codecs.string,
      range: queryParam.object('range', {
        min: codecs.integer.withDefault(0),
        max: codecs.integer,
      }).withDefault({ max: 10 }).withDefaultsWhenPresent(),
    })
    const q = withTestQuery({ filters: { q: 'phone' } })
      .build(() => useQueryStates({ filters }).use(withRuntimeDefaults()))

    expect(q.selected.filters).toEqual({ q: 'phone' })
    expect(q.values.filters).toEqual({ q: 'phone', range: { min: 0, max: 10 } })
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
