import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.timestamp', () => {
  it('parses milliseconds since the epoch into a Date', () => {
    expect(codecs.timestamp.parse('0')).toEqual(new Date(0))
    expect(codecs.timestamp.parse('1000')).toEqual(new Date(1000))
  })

  it('rejects non-integer values', () => {
    expect(codecs.timestamp.parse('abc')).toBeUndefined()
    expect(codecs.timestamp.parse('1.5')).toBeUndefined()
    expect(codecs.timestamp.parse(undefined)).toBeUndefined()
  })

  it('rejects an in-range-format integer that falls outside the Date range', () => {
    expect(codecs.timestamp.parse('99999999999999999999')).toBeUndefined()
  })

  it('serializes a Date into milliseconds', () => {
    expect(codecs.timestamp.serialize(new Date(1000))).toBe('1000')
  })

  it('is bijective', () => {
    const date = new Date(1_700_000_000_000)

    expect(isCodecBijective(codecs.timestamp, '1700000000000', date)).toBe(true)
  })

  it('compares by instant', () => {
    expect(codecs.timestamp.eq(new Date(1000), new Date(1000))).toBe(true)
    expect(codecs.timestamp.eq(new Date(1000), new Date(2000))).toBe(false)
  })
})
