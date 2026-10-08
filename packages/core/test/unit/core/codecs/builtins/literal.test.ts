import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.literal', () => {
  describe('string literals', () => {
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

  describe('numeric literals', () => {
    const level = codecs.literal([1, 2, 3])

    it('parses values in the set', () => {
      expect(level.parse('1')).toBe(1)
      expect(level.parse('3')).toBe(3)
      expect(level.parse('01')).toBe(1)
      expect(level.parse('1.0')).toBe(1)
      expect(level.parse(2)).toBe(2)
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

  it('rejects every input when the list is empty', () => {
    const codec = codecs.literal([])
    expect(codec.parse('value')).toBeUndefined()
    expect(codec.parse(1)).toBeUndefined()
  })

  it.each([
    { name: 'strings followed by numbers', values: ['1', 2] },
    { name: 'numbers followed by strings', values: [2, '1'] },
    { name: 'booleans', values: [true, false] },
    { name: 'objects', values: [{}] },
    { name: 'null', values: [null] },
    { name: 'undefined', values: [undefined] },
    { name: 'unsupported values after strings', values: ['asc', false] },
  ])('throws when created with $name', ({ values }) => {
    // @ts-expect-error Invalid lists exercise runtime validation for untyped callers.
    expect(() => codecs.literal(values)).toThrow(TypeError)
  })
})
