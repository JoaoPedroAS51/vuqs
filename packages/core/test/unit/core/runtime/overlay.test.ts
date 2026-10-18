import { describe, expect, it } from 'vitest'
import { applyOverlay } from '../../../../src/core/runtime/overlay'

describe('applyOverlay', () => {
  it('sets nested paths and keeps unmanaged siblings, including empty ones', () => {
    const query = { keep: '', filters: { sort: 'name', other: 'x' } }

    expect(applyOverlay(query, { 'filters.dir': 'asc', 'page': '2' })).toEqual({
      keep: '',
      filters: { sort: 'name', other: 'x', dir: 'asc' },
      page: '2',
    })
  })

  it('removes a null path and prunes only the ancestors it emptied', () => {
    const query = { filters: { sort: 'name' }, nested: { deep: { value: '1' }, sibling: '2' }, keep: 'me' }

    expect(applyOverlay(query, { 'filters.sort': null, 'nested.deep.value': null })).toEqual({
      nested: { sibling: '2' },
      keep: 'me',
    })
  })

  it('leaves the input untouched', () => {
    const query = { filters: { sort: 'name' } }

    applyOverlay(query, { 'filters.sort': null, 'filters.dir': 'asc' })

    expect(query).toEqual({ filters: { sort: 'name' } })
  })

  it('applies only the supplied paths', () => {
    expect(applyOverlay({ a: '1', b: '2' }, { a: '3' })).toEqual({ a: '3', b: '2' })
  })
})
