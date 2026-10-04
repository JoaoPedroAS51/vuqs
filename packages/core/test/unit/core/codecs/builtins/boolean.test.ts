import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.boolean', () => {
  it('parses true/false strings', () => {
    expect(codecs.boolean.parse('true')).toBe(true)
    expect(codecs.boolean.parse('false')).toBe(false)
  })

  it('rejects anything else', () => {
    expect(codecs.boolean.parse('1')).toBeUndefined()
  })

  it('serializes', () => {
    expect(codecs.boolean.serialize(true)).toBe('true')
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.boolean, 'true', true)).toBe(true)
    expect(isCodecBijective(codecs.boolean, 'false', false)).toBe(true)
  })
})
