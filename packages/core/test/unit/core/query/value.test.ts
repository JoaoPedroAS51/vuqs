import { describe, expect, it } from 'vitest'
import { getQueryString, getQueryStringArray } from '../../../../src/core/query/value'

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
