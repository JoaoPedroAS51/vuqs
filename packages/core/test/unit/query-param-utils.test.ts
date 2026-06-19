import { describe, expect, it } from 'vitest'
import { joinPath, prefixQuery } from '../../src/core/query-param-utils'

describe('joinPath', () => {
  it('joins a non-empty child path onto the prefix', () => {
    expect(joinPath('bounds', 'north')).toBe('bounds.north')
  })

  it('returns the prefix itself for an empty child path', () => {
    expect(joinPath('bounds', '')).toBe('bounds')
  })
})

describe('prefixQuery', () => {
  it('prefixes every leaf path in the query', () => {
    expect(prefixQuery({ north: '1', east: '2' }, 'bounds')).toEqual({
      bounds: { north: '1', east: '2' },
    })
  })

  it('drops a leaf whose value is explicitly undefined', () => {
    expect(prefixQuery({ north: '1', east: undefined }, 'bounds')).toEqual({
      bounds: { north: '1' },
    })
  })
})
