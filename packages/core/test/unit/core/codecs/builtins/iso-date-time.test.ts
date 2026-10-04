import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.isoDateTime', () => {
  it('parses an ISO-8601 string into a Date', () => {
    expect(codecs.isoDateTime.parse('2026-06-22T12:00:00.000Z')).toEqual(new Date('2026-06-22T12:00:00.000Z'))
  })

  it('rejects invalid values', () => {
    expect(codecs.isoDateTime.parse('not-a-date')).toBeUndefined()
    expect(codecs.isoDateTime.parse(undefined)).toBeUndefined()
  })

  it('serializes a Date into a full ISO-8601 string', () => {
    expect(codecs.isoDateTime.serialize(new Date('2026-06-22T12:00:00.000Z'))).toBe('2026-06-22T12:00:00.000Z')
  })

  it('is bijective', () => {
    const date = new Date('2026-06-22T12:34:56.789Z')

    expect(isCodecBijective(codecs.isoDateTime, '2026-06-22T12:34:56.789Z', date)).toBe(true)
  })

  it('compares by instant', () => {
    expect(codecs.isoDateTime.eq(new Date('2026-06-22T12:00:00.000Z'), new Date('2026-06-22T12:00:00.000Z'))).toBe(true)
    expect(codecs.isoDateTime.eq(new Date('2026-06-22T12:00:00.000Z'), new Date('2026-06-22T13:00:00.000Z'))).toBe(false)
  })
})
