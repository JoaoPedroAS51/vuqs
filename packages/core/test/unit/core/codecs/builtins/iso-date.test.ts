import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.isoDate', () => {
  it('parses a date-only string at midnight UTC', () => {
    expect(codecs.isoDate.parse('2026-06-22')).toEqual(new Date('2026-06-22'))
  })

  it('truncates the time portion to the date', () => {
    expect(codecs.isoDate.parse('2026-06-22T12:00:00.000Z')).toEqual(new Date('2026-06-22'))
  })

  it('rejects invalid values', () => {
    expect(codecs.isoDate.parse('not-a-date')).toBeUndefined()
    expect(codecs.isoDate.parse(undefined)).toBeUndefined()
  })

  it('rejects partial date strings that would not round-trip', () => {
    expect(codecs.isoDate.parse('2026-06')).toBeUndefined()
    expect(codecs.isoDate.parse('2026')).toBeUndefined()
  })

  it('rejects a calendar date that matches the format but does not exist', () => {
    expect(codecs.isoDate.parse('2026-13-45')).toBeUndefined()
  })

  it('serializes a Date into a date-only string', () => {
    expect(codecs.isoDate.serialize(new Date('2026-06-22T12:00:00.000Z'))).toBe('2026-06-22')
  })

  it('is bijective', () => {
    const date = new Date('2026-06-22')

    expect(isCodecBijective(codecs.isoDate, '2026-06-22', date)).toBe(true)
  })

  it('compares by instant', () => {
    expect(codecs.isoDate.eq(new Date('2026-06-22'), new Date('2026-06-22'))).toBe(true)
    expect(codecs.isoDate.eq(new Date('2026-06-22'), new Date('2026-06-23'))).toBe(false)
  })
})
