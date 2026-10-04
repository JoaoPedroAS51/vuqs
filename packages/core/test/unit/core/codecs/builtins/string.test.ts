import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.string', () => {
  it('parses and serializes', () => {
    expect(codecs.string.parse('phone')).toBe('phone')
    expect(codecs.string.serialize('phone')).toBe('phone')
  })

  it('parses absent as undefined', () => {
    expect(codecs.string.parse(undefined)).toBeUndefined()
    expect(codecs.string.parse('')).toBeUndefined()
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.string, 'phone', 'phone')).toBe(true)
  })
})
