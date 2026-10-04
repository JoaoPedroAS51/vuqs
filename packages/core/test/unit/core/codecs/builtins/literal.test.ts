import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.literal', () => {
  const sort = codecs.literal(['asc', 'desc'])

  it('parses allowed values', () => {
    expect(sort.parse('asc')).toBe('asc')
  })

  it('rejects disallowed values', () => {
    expect(sort.parse('sideways')).toBeUndefined()
  })

  it('is bijective', () => {
    expect(isCodecBijective(sort, 'asc', 'asc')).toBe(true)
    expect(isCodecBijective(sort, 'desc', 'desc')).toBe(true)
  })
})
