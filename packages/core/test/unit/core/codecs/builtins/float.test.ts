import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.float', () => {
  it('parses decimals and scientific notation', () => {
    expect(codecs.float.parse('4.5')).toBe(4.5)
    expect(codecs.float.parse('1e3')).toBe(1000)
  })

  it('rejects non-finite and partial-numeric values', () => {
    expect(codecs.float.parse('Infinity')).toBeUndefined()
    expect(codecs.float.parse('-Infinity')).toBeUndefined()
    expect(codecs.float.parse('NaN')).toBeUndefined()
    expect(codecs.float.parse('4.5abc')).toBeUndefined()
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.float, '4.5', 4.5)).toBe(true)
  })
})
