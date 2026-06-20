import { describe, expect, it } from 'vitest'
import { compactQuery, mergeQueries } from '../../src/core/query-object'

describe('mergeQueries', () => {
  it('deep-merges nested objects', () => {
    expect(mergeQueries({ filters: { sort: 'name' } }, { filters: { owner: 'me' } })).toEqual({
      filters: { sort: 'name', owner: 'me' },
    })
  })

  it('replaces arrays wholesale', () => {
    expect(mergeQueries({ list: ['a', 'b'] }, { list: ['c'] })).toEqual({ list: ['c'] })
  })

  it('replaces an object with a scalar (next wins)', () => {
    expect(mergeQueries({ filters: { sort: 'name' } }, { filters: 'all' })).toEqual({ filters: 'all' })
  })

  it('does not compact, preserving empty values', () => {
    expect(mergeQueries({ q: '' }, { page: '2' })).toEqual({ q: '', page: '2' })
  })

  it('does not mutate its inputs', () => {
    const base = { filters: { sort: 'name' } }
    const next = { filters: { owner: 'me' } }

    mergeQueries(base, next)

    expect(base).toEqual({ filters: { sort: 'name' } })
    expect(next).toEqual({ filters: { owner: 'me' } })
  })
})

describe('compactQuery', () => {
  it('drops nullish, blank strings, and empty arrays/objects recursively', () => {
    expect(compactQuery({
      a: '',
      b: '  ',
      c: null,
      d: [],
      e: {},
      f: { nested: '' },
      keep: 'x',
    })).toEqual({ keep: 'x' })
  })

  it('keeps meaningful falsy values', () => {
    expect(compactQuery({ zero: 0, no: false, str: 'x' })).toEqual({ zero: 0, no: false, str: 'x' })
  })
})
