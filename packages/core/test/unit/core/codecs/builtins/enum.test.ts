import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { isCodecBijective } from '../../../../../src/testing'

describe('codecs.enum', () => {
  enum Status {
    Active = 'active',
    Archived = 'archived',
  }

  enum Level {
    Low,
    Medium,
    High,
  }

  const status = codecs.enum(Status)
  const level = codecs.enum(Level)

  it('parses string enum members', () => {
    expect(status.parse('active')).toBe(Status.Active)
    expect(status.parse('archived')).toBe(Status.Archived)
  })

  it('parses numeric enum members by their number, not their key', () => {
    expect(level.parse('0')).toBe(Level.Low)
    expect(level.parse('2')).toBe(Level.High)
    expect(level.parse('Low')).toBeUndefined()
  })

  it('rejects values outside the enum', () => {
    expect(status.parse('deleted')).toBeUndefined()
    expect(status.parse(undefined)).toBeUndefined()
    expect(level.parse('3')).toBeUndefined()
  })

  it('serializes', () => {
    expect(status.serialize(Status.Active)).toBe('active')
    expect(level.serialize(Level.High)).toBe('2')
  })

  it('is bijective', () => {
    expect(isCodecBijective(status, 'active', Status.Active)).toBe(true)
    expect(isCodecBijective(level, '1', Level.Medium)).toBe(true)
  })
})
