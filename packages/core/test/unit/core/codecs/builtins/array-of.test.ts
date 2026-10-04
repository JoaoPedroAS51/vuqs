import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.arrayOf', () => {
  const numbers = codecs.arrayOf(codecs.integer)

  it('parses each item', () => {
    expect(numbers.parse(['1', '2', '3'])).toEqual([1, 2, 3])
  })

  it('drops invalid items and treats empty as absent', () => {
    expect(numbers.parse(['1', 'x', '2'])).toEqual([1, 2])
    expect(numbers.parse(['x'])).toBeUndefined()
  })

  it('treats a scalar raw value as a single-item array', () => {
    expect(numbers.parse('5')).toEqual([5])
  })

  it('treats an absent raw value as no items', () => {
    expect(numbers.parse(undefined)).toBeUndefined()
    expect(numbers.parse(null)).toBeUndefined()
  })

  it('serializes each item', () => {
    expect(numbers.serialize([1, 2])).toEqual(['1', '2'])
  })

  it('compares element-wise', () => {
    expect(numbers.eq([1, 2], [1, 2])).toBe(true)
    expect(numbers.eq([1, 2], [1, 3])).toBe(false)
  })

  it('is bijective', () => {
    expect(isCodecBijective(numbers, ['1', '2', '3'], [1, 2, 3])).toBe(true)
  })
})
