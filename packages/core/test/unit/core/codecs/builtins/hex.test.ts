import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.hex', () => {
  it('parses hexadecimal values', () => {
    expect(codecs.hex.parse('ff')).toBe(255)
    expect(codecs.hex.parse('FF')).toBe(255)
    expect(codecs.hex.parse('10')).toBe(16)
  })

  it('rejects non-hex values', () => {
    expect(codecs.hex.parse('gg')).toBeUndefined()
    expect(codecs.hex.parse('0xff')).toBeUndefined()
    expect(codecs.hex.parse(undefined)).toBeUndefined()
  })

  it('serializes and pads to even length', () => {
    expect(codecs.hex.serialize(255)).toBe('ff')
    expect(codecs.hex.serialize(10)).toBe('0a')
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.hex, 'ff', 255)).toBe(true)
    expect(isCodecBijective(codecs.hex, '0a', 10)).toBe(true)
  })
})
