import { describe, expect, it } from 'vitest'
import { codecs, createCodec } from '../../src/core/codec'
import { isCodecBijective, testParseThenSerialize, testSerializeThenParse } from '../../src/testing'

describe('testSerializeThenParse', () => {
  it('returns true for a bijective integer codec', () => {
    expect(testSerializeThenParse(codecs.integer, 42)).toBe(true)
  })

  it('returns true for negative integers', () => {
    expect(testSerializeThenParse(codecs.integer, -7)).toBe(true)
  })

  it('returns true for a string codec', () => {
    expect(testSerializeThenParse(codecs.string, 'hello')).toBe(true)
  })

  it('returns true for a boolean codec', () => {
    expect(testSerializeThenParse(codecs.boolean, true)).toBe(true)
    expect(testSerializeThenParse(codecs.boolean, false)).toBe(true)
  })

  it('returns true for a float codec', () => {
    expect(testSerializeThenParse(codecs.float, 3.14)).toBe(true)
  })

  it('returns true for an arrayOf codec', () => {
    expect(testSerializeThenParse(codecs.arrayOf(codecs.integer), [1, 2, 3])).toBe(true)
  })

  it('throws when parsed value is undefined (codec rejects its own serialized output)', () => {
    const broken = createCodec<number>({
      parse: () => undefined,
      serialize: value => String(value),
    })

    expect(() => testSerializeThenParse(broken, 42)).toThrowError(
      '[vuqs] testSerializeThenParse: parsed value is undefined',
    )
  })

  it('throws when parse(serialize(input)) does not equal input', () => {
    const lossy = createCodec<number>({
      parse: raw => (raw === null || raw === undefined ? undefined : Number(String(raw).slice(0, 1))),
      serialize: value => String(value),
    })

    expect(() => testSerializeThenParse(lossy, 42)).toThrowError(
      '[vuqs] codec is not bijective (in testSerializeThenParse)',
    )
  })

  it('throws for NaN (integer codec rejects NaN serialized form)', () => {
    expect(() => testSerializeThenParse(codecs.integer, Number.NaN)).toThrowError(
      '[vuqs] testSerializeThenParse: parsed value is undefined',
    )
  })

  it('returns true for a withDefault codec', () => {
    expect(testSerializeThenParse(codecs.integer.withDefault(0), 42)).toBe(true)
  })
})

describe('testParseThenSerialize', () => {
  it('returns true for a valid integer string', () => {
    expect(testParseThenSerialize(codecs.integer, '42')).toBe(true)
  })

  it('returns true for negative integer strings', () => {
    expect(testParseThenSerialize(codecs.integer, '-7')).toBe(true)
  })

  it('returns true for a string codec', () => {
    expect(testParseThenSerialize(codecs.string, 'hello')).toBe(true)
  })

  it('returns true for a boolean codec', () => {
    expect(testParseThenSerialize(codecs.boolean, 'true')).toBe(true)
    expect(testParseThenSerialize(codecs.boolean, 'false')).toBe(true)
  })

  it('returns true for an arrayOf codec (array input)', () => {
    expect(testParseThenSerialize(codecs.arrayOf(codecs.integer), ['1', '2', '3'])).toBe(true)
  })

  it('throws when the serialized input is rejected by parse (returns undefined)', () => {
    expect(() => testParseThenSerialize(codecs.integer, 'not-a-number')).toThrowError(
      '[vuqs] testParseThenSerialize: parsed value is undefined',
    )
  })

  it('throws when serialize(parse(serialized)) does not equal serialized', () => {
    const normalizing = createCodec<number>({
      parse: raw => (typeof raw === 'string' ? Number(raw) : undefined),
      serialize: value => String(Math.abs(value)),
    })

    expect(() => testParseThenSerialize(normalizing, '-5')).toThrowError(
      '[vuqs] codec is not bijective (in testParseThenSerialize)',
    )
  })

  it('returns true for a withDefault codec', () => {
    expect(testParseThenSerialize(codecs.integer.withDefault(0), '42')).toBe(true)
  })
})

describe('isCodecBijective', () => {
  it('returns true for a bijective integer codec', () => {
    expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
  })

  it('returns true for a string codec', () => {
    expect(isCodecBijective(codecs.string, 'hello', 'hello')).toBe(true)
  })

  it('returns true for a boolean codec', () => {
    expect(isCodecBijective(codecs.boolean, 'true', true)).toBe(true)
    expect(isCodecBijective(codecs.boolean, 'false', false)).toBe(true)
  })

  it('returns true for a float codec', () => {
    expect(isCodecBijective(codecs.float, '3.14', 3.14)).toBe(true)
  })

  it('returns true for a literal codec', () => {
    const status = codecs.literal(['open', 'closed', 'pending'] as const)
    expect(isCodecBijective(status, 'open', 'open')).toBe(true)
  })

  it('returns true for an arrayOf codec', () => {
    expect(isCodecBijective(codecs.arrayOf(codecs.integer), ['1', '2', '3'], [1, 2, 3])).toBe(true)
  })

  it('throws when serialize(input) does not match the expected serialized value', () => {
    expect(() => isCodecBijective(codecs.integer, '999', 42)).toThrowError(
      '[vuqs] codec.serialize does not match expected serialized value',
    )
  })

  it('throws when serialize(input) does not produce the expected serialized value', () => {
    // serialize(99) = '99', but expected serialized is '42' — mismatch caught at the
    // serialize-check stage, before the round-trip tests.
    expect(() => isCodecBijective(codecs.integer, '42', 99)).toThrowError(
      '[vuqs] codec.serialize does not match expected serialized value',
    )
  })

  it('throws when serialized is rejected by parse', () => {
    expect(() => isCodecBijective(codecs.integer, 'not-a-number', 42)).toThrowError(
      '[vuqs] testParseThenSerialize: parsed value is undefined',
    )
  })

  it('returns true for a withDefault codec', () => {
    expect(isCodecBijective(codecs.integer.withDefault(0), '42', 42)).toBe(true)
  })

  it('returns true for a json codec with a plain object', () => {
    const json = codecs.json<{ x: number }>()
    const value = { x: 1 }
    expect(isCodecBijective(json, JSON.stringify(value), value)).toBe(true)
  })

  it('throws for a json codec when expected input does not match', () => {
    const json = codecs.json<{ x: number }>()
    expect(() => isCodecBijective(json, '{"x":1}', { x: 2 })).toThrowError(
      '[vuqs] codec.serialize does not match expected serialized value',
    )
  })
})
