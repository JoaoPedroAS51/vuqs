import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.numberLiteral', () => {
  const level = codecs.numberLiteral([1, 2, 3])

  it('parses values in the set', () => {
    expect(level.parse('1')).toBe(1)
    expect(level.parse('3')).toBe(3)
  })

  it('rejects values outside the set', () => {
    expect(level.parse('4')).toBeUndefined()
    expect(level.parse('abc')).toBeUndefined()
    expect(level.parse(undefined)).toBeUndefined()
  })

  it('serializes', () => {
    expect(level.serialize(2)).toBe('2')
  })

  it('is bijective', () => {
    expect(isCodecBijective(level, '2', 2)).toBe(true)
  })
})
