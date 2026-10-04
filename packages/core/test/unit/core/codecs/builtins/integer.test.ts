import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.integer', () => {
  it('parses valid integers', () => {
    expect(codecs.integer.parse('42')).toBe(42)
  })

  it('rejects non-numeric values', () => {
    expect(codecs.integer.parse('abc')).toBeUndefined()
    expect(codecs.integer.parse(undefined)).toBeUndefined()
  })

  it('rejects partial-numeric and non-decimal values', () => {
    expect(codecs.integer.parse('42abc')).toBeUndefined()
    expect(codecs.integer.parse('4.5')).toBeUndefined()
    expect(codecs.integer.parse('0x10')).toBeUndefined()
  })

  it('serializes as a string', () => {
    expect(codecs.integer.serialize(42)).toBe('42')
    expect(codecs.integer.serialize(42.9)).toBe('42')
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
    expect(isCodecBijective(codecs.integer, '-7', -7)).toBe(true)
  })
})
