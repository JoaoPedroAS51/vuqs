import { describe, expect, it } from 'vitest'
import { deletePath, getPath, getQueryString, getQueryStringArray, setPath } from '../../src/core/path'

describe('getPath', () => {
  it('reads a nested value', () => {
    expect(getPath({ filters: { sort: 'name' } }, 'filters.sort')).toBe('name')
  })

  it('returns undefined for a missing segment', () => {
    expect(getPath({ filters: {} }, 'filters.sort')).toBeUndefined()
    expect(getPath({}, 'filters.sort')).toBeUndefined()
  })

  it('returns undefined when a segment is not an object', () => {
    expect(getPath({ filters: 'x' }, 'filters.sort')).toBeUndefined()
  })

  it('reads a single-segment path', () => {
    expect(getPath({ page: '2' }, 'page')).toBe('2')
  })
})

describe('setPath', () => {
  it('writes a nested value, creating intermediate objects', () => {
    expect(setPath({}, 'filters.sort', 'name')).toEqual({ filters: { sort: 'name' } })
  })

  it('preserves existing siblings', () => {
    expect(setPath({ filters: { owner: 'me' } }, 'filters.sort', 'name')).toEqual({
      filters: { owner: 'me', sort: 'name' },
    })
  })

  it('writes a single-segment path', () => {
    expect(setPath({}, 'page', '2')).toEqual({ page: '2' })
  })

  it('ignores unsafe prototype segments', () => {
    expect(setPath({}, '__proto__.polluted', 'x')).toEqual({})
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('deletePath', () => {
  it('removes a nested key while keeping siblings', () => {
    const query = { filters: { sort: 'name', owner: 'me' } }

    deletePath(query, 'filters.sort')

    expect(query).toEqual({ filters: { owner: 'me' } })
  })

  it('is a no-op for a missing path', () => {
    const query = { filters: { owner: 'me' } }

    deletePath(query, 'filters.sort')
    deletePath(query, 'missing.deep')

    expect(query).toEqual({ filters: { owner: 'me' } })
  })

  it('removes a single-segment key', () => {
    const query = { page: '2', owner: 'me' }

    deletePath(query, 'page')

    expect(query).toEqual({ owner: 'me' })
  })
})

describe('getQueryString', () => {
  it('reads a scalar string', () => {
    expect(getQueryString('name')).toBe('name')
  })

  it('reads the first item of an array', () => {
    expect(getQueryString(['a', 'b'])).toBe('a')
  })

  it('rejects empty and non-string values', () => {
    expect(getQueryString('')).toBeUndefined()
    expect(getQueryString('  ')).toBeUndefined()
    expect(getQueryString(undefined)).toBeUndefined()
    expect(getQueryString(5)).toBeUndefined()
  })
})

describe('getQueryStringArray', () => {
  it('wraps a scalar', () => {
    expect(getQueryStringArray('a')).toEqual(['a'])
  })

  it('filters empties out of an array', () => {
    expect(getQueryStringArray(['a', '', '  ', 'b'])).toEqual(['a', 'b'])
  })

  it('returns an empty array for absent values', () => {
    expect(getQueryStringArray(undefined)).toEqual([])
  })
})
