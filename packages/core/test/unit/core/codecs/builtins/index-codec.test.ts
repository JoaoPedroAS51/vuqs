import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.index', () => {
  it('parses a 1-based url value into a 0-based value', () => {
    expect(codecs.index.parse('1')).toBe(0)
    expect(codecs.index.parse('42')).toBe(41)
  })

  it('rejects non-integer values', () => {
    expect(codecs.index.parse('abc')).toBeUndefined()
    expect(codecs.index.parse('42abc')).toBeUndefined()
    expect(codecs.index.parse('4.5')).toBeUndefined()
    expect(codecs.index.parse(undefined)).toBeUndefined()
  })

  it('serializes a 0-based value into a 1-based string', () => {
    expect(codecs.index.serialize(0)).toBe('1')
    expect(codecs.index.serialize(41)).toBe('42')
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.index, '8', 7)).toBe(true)
  })
})
