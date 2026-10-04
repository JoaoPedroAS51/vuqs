import type { Codec } from '../../../../src/core/codecs/codec'
import type { ParsedQueryValue } from '../../../../src/core/query/types'
import { describe, expect, it, vi } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../src/core/codecs/codec'

function codecCase<T>(name: string, codec: Codec<T>, raw: ParsedQueryValue, expected: T) {
  return { name, codec, parse: (raw: ParsedQueryValue) => codec.parse(raw), raw, expected }
}

describe('createCodec', () => {
  it('defaults eq to structural equality', () => {
    const codec = createCodec<{ id: string }>({
      parse: raw => (typeof raw === 'string' ? { id: raw } : undefined),
      serialize: value => value.id,
    })

    expect(codec.eq({ id: 'a' }, { id: 'a' })).toBe(true)
    expect(codec.eq({ id: 'a' }, { id: 'b' })).toBe(false)
  })

  describe('withDefault', () => {
    it('keeps parse raw and exposes the default separately', () => {
      const page = codecs.integer.withDefault(1)

      expect(page.parse(undefined)).toBeUndefined()
      expect(page.parse('3')).toBe(3)
      expect(page.defaultValue).toBe(1)
    })

    it('does not mutate the base codec', () => {
      codecs.integer.withDefault(1)

      expect(codecs.integer.defaultValue).toBeUndefined()
      expect(codecs.integer.parse(undefined)).toBeUndefined()
    })
  })
})

describe('codec.nullable', () => {
  it.each([
    codecCase('string', codecs.string, 'phone', 'phone'),
    codecCase('integer', codecs.integer, '42', 42),
    codecCase('float', codecs.float, '2.5', 2.5),
    codecCase('boolean', codecs.boolean, 'false', false),
    codecCase('index', codecs.index, '1', 0),
    codecCase('hex', codecs.hex, '0a', 10),
    codecCase('timestamp', codecs.timestamp, '0', new Date(0)),
    codecCase('isoDateTime', codecs.isoDateTime, '2026-01-02T00:00:00.000Z', new Date('2026-01-02T00:00:00.000Z')),
    codecCase('isoDate', codecs.isoDate, '2026-01-02', new Date('2026-01-02T00:00:00.000Z')),
    codecCase('literal', codecs.literal(['asc', 'desc']), 'asc', 'asc'),
    codecCase('numberLiteral', codecs.numberLiteral([1, 2]), '2', 2),
    codecCase('enum', codecs.enum({ Open: 1, Closed: 2 }), '1', 1),
    codecCase('arrayOf', codecs.arrayOf(codecs.integer), ['1', '2'], [1, 2]),
    codecCase('json', codecs.json<{ id: number }>(), '{"id":1}', { id: 1 }),
  ])('keeps $name parsing and serializes null as absence', ({ codec, raw, expected }) => {
    const nullable = codec.nullable()

    expect(nullable.parse(raw)).toEqual(expected)
    expect(nullable.parse(undefined)).toBeUndefined()
    expect(nullable.serialize(null)).toBeUndefined()
    expect(nullable.defaultValue).toBeUndefined()
  })

  it('delegates non-null serialization and equality to a custom codec', () => {
    const serialize = vi.fn((value: number) => String(value + 1))
    const eq = vi.fn((a: number, b: number) => Math.floor(a) === Math.floor(b))
    const base = createCodec({ parse: codecs.float.parse, serialize, eq })
    const nullable = base.nullable()

    expect(nullable.parse).toBe(base.parse)
    expect(nullable.serialize(2)).toBe('3')
    expect(serialize).toHaveBeenCalledExactlyOnceWith(2)
    expect(nullable.serialize(null)).toBeUndefined()
    expect(serialize).toHaveBeenCalledOnce()

    expect(nullable.eq(null, null)).toBe(true)
    expect(nullable.eq(null, 2)).toBe(false)
    expect(nullable.eq(2, null)).toBe(false)
    expect(eq).not.toHaveBeenCalled()
    expect(nullable.eq(2.1, 2.9)).toBe(true)
    expect(eq).toHaveBeenCalledExactlyOnceWith(2.1, 2.9)
  })

  it('compares nullable dates without calling date equality with null', () => {
    const nullable = codecs.isoDate.nullable()

    expect(nullable.eq(null, new Date(0))).toBe(false)
    expect(nullable.eq(new Date(0), null)).toBe(false)
    expect(nullable.eq(new Date(0), new Date(0))).toBe(true)
  })

  it('preserves defaults through either modifier order and replacement', () => {
    const first = codecs.integer.withDefault(0).nullable()
    const second = codecs.integer.nullable().withDefault(0)
    const replaced = first.withDefault(null)

    for (const codec of [first, second, replaced, replaced.nullable()]) {
      expect(codec.serialize(null)).toBeUndefined()
      expect(codec.serialize(2)).toBe('2')
      expect(codec.parse(undefined)).toBeUndefined()
    }
    expect(first.defaultValue).toBe(0)
    expect(second.defaultValue).toBe(0)
    expect(replaced.defaultValue).toBeNull()
    expect(replaced.nullable().defaultValue).toBeNull()
    expect(codecs.integer.defaultValue).toBeUndefined()
  })

  it('keeps a default even when its value is undefined', () => {
    const base = createCodec<string | undefined>({
      parse: codecs.string.parse,
      serialize: value => value,
    }).withDefault(undefined)

    expect(Object.hasOwn(base.nullable(), 'defaultValue')).toBe(true)
    expect(base.nullable().defaultValue).toBeUndefined()
  })

  it('returns independent variants and supports repeated nullable calls', () => {
    const base = codecs.boolean.withDefault(false)
    const first = base.nullable()
    const second = base.nullable()

    expect(first).not.toBe(second)
    expect(first.defaultValue).toBe(false)
    expect(first.nullable().defaultValue).toBe(false)
    expect(first.nullable().serialize(null)).toBeUndefined()
    expect(first.nullable().serialize(false)).toBe('false')
    expect(base.serialize(false)).toBe('false')
    expect(base.defaultValue).toBe(false)
  })

  it('retains JSON null parsing while omitting null writes', () => {
    const nullable = codecs.json<{ id: number } | null>().nullable()

    expect(nullable.parse('null')).toBeNull()
    expect(nullable.serialize(null)).toBeUndefined()
  })
})
