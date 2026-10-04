import type { Codec } from '../../../../src/core/codecs/codec'
import type { ParsedQueryValue } from '../../../../src/core/query/types'
import { describe, expect, it, vi } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'

function codecCase<T>(name: string, codec: Codec<T>, raw: ParsedQueryValue, expected: T) {
  return { name, codec, parse: (raw: ParsedQueryValue) => codec.parse(raw), raw, expected }
}

describe('codec query inputs', () => {
  describe('scalar values', () => {
    it.each([
      codecCase('integer', codecs.integer, 42, 42),
      codecCase('negative integer', codecs.integer, -7, -7),
      codecCase('zero integer', codecs.integer, 0, 0),
      codecCase('float', codecs.float, 2.5, 2.5),
      codecCase('zero float', codecs.float, 0, 0),
      codecCase('true boolean', codecs.boolean, true, true),
      codecCase('false boolean', codecs.boolean, false, false),
      codecCase('index', codecs.index, 1, 0),
      codecCase('timestamp', codecs.timestamp, 1000, new Date(1000)),
      codecCase('epoch timestamp', codecs.timestamp, 0, new Date(0)),
      codecCase('numberLiteral', codecs.numberLiteral([1, 2]), 2, 2),
      codecCase('numeric enum', codecs.enum({ Open: 1, Closed: 2 }), 1, 1),
      codecCase('hex digits', codecs.hex, 10, 16),
    ])('decodes $name', ({ parse, raw, expected }) => {
      expect(parse(raw)).toEqual(expected)
    })

    it('keeps codec defaults separate from parsing', () => {
      const codec = codecs.integer.withDefault(1)

      expect(codec.parse(2)).toBe(2)
      expect(codec.parse(undefined)).toBeUndefined()
    })

    it('reads the first repeated value for a scalar codec', () => {
      expect(codecs.integer.parse([1, 2])).toBe(1)
    })

    it('keeps string codecs and literals textual', () => {
      expect(codecs.string.parse(42)).toBeUndefined()
      expect(codecs.string.parse(false)).toBeUndefined()
      expect(codecs.literal(['42', 'false']).parse(42)).toBeUndefined()
      expect(codecs.literal(['42', 'false']).parse(false)).toBeUndefined()
    })

    it('matches native enum values by their declared type', () => {
      const codec = codecs.enum({ Numeric: 1, Textual: '1' } as const)

      expect(codec.parse(1)).toBe(1)
      expect(codec.parse('1')).toBe('1')
      expect(codecs.enum({ Textual: '1' }).parse(1)).toBeUndefined()
      expect(codecs.enum({ Textual: 'true' }).parse(true)).toBeUndefined()
    })

    it('reads only the first scalar array item without flattening nested arrays', () => {
      expect(codecs.boolean.parse([false, true])).toBe(false)
      expect(codecs.hex.parse([10, 20])).toBe(16)
      expect(codecs.integer.parse([null, 2])).toBeUndefined()
      expect(codecs.integer.parse([['1', '2']])).toBeUndefined()
    })

    it('rejects incompatible primitive types', () => {
      expect(codecs.integer.parse(true)).toBeUndefined()
      expect(codecs.float.parse(false)).toBeUndefined()
      expect(codecs.numberLiteral([0, 1]).parse(true)).toBeUndefined()
      expect(codecs.boolean.parse(1)).toBeUndefined()
      expect(codecs.isoDate.parse(2026)).toBeUndefined()
      expect(codecs.isoDateTime.parse(0)).toBeUndefined()
    })

    it('rejects fractional input for integer representations', () => {
      expect(codecs.integer.parse(2.5)).toBeUndefined()
      expect(codecs.index.parse(2.5)).toBeUndefined()
      expect(codecs.timestamp.parse(2.5)).toBeUndefined()
      expect(codecs.hex.parse(2.5)).toBeUndefined()
      expect(codecs.hex.parse(-10)).toBeUndefined()
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects non-finite numeric input %s', (raw) => {
      expect(codecs.integer.parse(raw)).toBeUndefined()
      expect(codecs.float.parse(raw)).toBeUndefined()
      expect(codecs.index.parse(raw)).toBeUndefined()
      expect(codecs.timestamp.parse(raw)).toBeUndefined()
      expect(codecs.hex.parse(raw)).toBeUndefined()
      expect(codecs.numberLiteral([1, 2]).parse(raw)).toBeUndefined()
      expect(codecs.json().parse(raw)).toBeUndefined()
    })

    it('rejects numeric text that overflows to a non-finite value', () => {
      const raw = '9'.repeat(400)

      expect(codecs.integer.parse(raw)).toBeUndefined()
      expect(codecs.float.parse(raw)).toBeUndefined()
      expect(codecs.hex.parse(raw)).toBeUndefined()
    })

    it.each([
      { name: 'integer', codec: codecs.integer },
      { name: 'float', codec: codecs.float },
      { name: 'boolean', codec: codecs.boolean },
      { name: 'string', codec: codecs.string },
    ])('rejects an object as $name input', ({ codec }) => {
      expect(codec.parse({ value: 1 })).toBeUndefined()
    })
  })

  describe('array values', () => {
    it.each([
      codecCase('integer array', codecs.arrayOf(codecs.integer), [0, 1, 2], [0, 1, 2]),
      codecCase('float array', codecs.arrayOf(codecs.float), [0, 1.5, 2.5], [0, 1.5, 2.5]),
      codecCase('boolean array', codecs.arrayOf(codecs.boolean), [true, false], [true, false]),
    ])('decodes $name', ({ parse, raw, expected }) => {
      expect(parse(raw)).toEqual(expected)
    })

    it('drops invalid array items without dropping valid numbers', () => {
      expect(codecs.arrayOf(codecs.integer).parse([1, 'invalid', 2])).toEqual([1, 2])
    })

    it('preserves valid items in an array containing numbers and strings', () => {
      expect(codecs.arrayOf(codecs.float).parse([1, '2e0', 3])).toEqual([1, 2, 3])
    })

    it('treats a scalar as a single-item array', () => {
      expect(codecs.arrayOf(codecs.integer).parse(42)).toEqual([42])
    })

    it('decodes an array of parsed objects', () => {
      const codec = codecs.arrayOf(codecs.json<{ id: number }>())

      expect(codec.parse([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('decodes an array containing objects and JSON text', () => {
      const codec = codecs.arrayOf(codecs.json<{ id: number }>())

      expect(codec.parse([{ id: 1 }, '{"id":2}', { id: 3 }])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    })

    it('drops object array items rejected by their validator', () => {
      const validate = vi.fn((value: unknown) => {
        if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'number') {
          throw new TypeError('invalid id')
        }
        return { id: value.id }
      })
      const codec = codecs.arrayOf(codecs.json({ validate }))

      expect(codec.parse([{ id: 1 }, { id: 'invalid' }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }])
      expect(validate).toHaveBeenCalledTimes(3)
    })

    it('preserves nested array structure while decoding each item', () => {
      const codec = codecs.arrayOf(codecs.arrayOf(codecs.integer))

      expect(codec.parse([[1, '2'], ['3', 4]])).toEqual([[1, 2], [3, 4]])
    })
  })

  describe('json values', () => {
    it.each([
      codecCase('JSON object', codecs.json<{ id: number }>(), { id: 1 }, { id: 1 }),
      codecCase('empty JSON object', codecs.json<Record<string, unknown>>(), {}, {}),
      codecCase('JSON array', codecs.json<Array<{ id: number }>>(), [{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }]),
      codecCase('empty JSON array', codecs.json<unknown[]>(), [], []),
      codecCase('JSON number', codecs.json<number>(), 0, 0),
      codecCase('JSON boolean', codecs.json<boolean>(), false, false),
      codecCase('nested JSON value', codecs.json(), { range: { min: 0, max: 2.5 }, enabled: false, tags: ['a', 'b'], note: null }, { range: { min: 0, max: 2.5 }, enabled: false, tags: ['a', 'b'], note: null }),
    ])('decodes $name', ({ parse, raw, expected }) => {
      expect(parse(raw)).toEqual(expected)
    })

    it.each([
      { name: 'JSON text', raw: '{"id":1}' },
      { name: 'parsed object', raw: { id: 1 } },
      { name: 'parsed array', raw: [{ id: 1 }, { id: 2 }] },
    ])('passes the complete $name to the validator', ({ raw }) => {
      const validate = vi.fn((value: unknown) => value)
      const codec = codecs.json({ validate })
      const expected = typeof raw === 'string' ? { id: 1 } : raw
      const result = codec.parse(raw)

      expect(validate).toHaveBeenCalledExactlyOnceWith(expected)
      expect(result).toEqual(expected)
    })

    it('returns the validator output for a parsed object', () => {
      const raw = { id: 1 }
      const validated = { id: 1, label: 'one' }
      const validate = vi.fn(() => validated)

      expect(codecs.json({ validate }).parse(raw)).toEqual(validated)
      expect(validate).toHaveBeenCalledExactlyOnceWith(raw)
    })

    it.each([
      { name: 'JSON text', raw: '{"id":"invalid"}' },
      { name: 'parsed object', raw: { id: 'invalid' } },
      { name: 'parsed array', raw: [{ id: 'invalid' }] },
    ])('treats a validator failure for $name as absent', ({ raw }) => {
      const validate = vi.fn(() => {
        throw new TypeError('invalid id')
      })
      const codec = codecs.json({ validate })
      const expected = typeof raw === 'string' ? { id: 'invalid' } : raw

      expect(codec.parse(raw)).toBeUndefined()
      expect(validate).toHaveBeenCalledExactlyOnceWith(expected)
    })

    it('reads an array of JSON strings as the complete JSON value', () => {
      const raw = ['{"id":1}', '{"id":2}']

      expect(codecs.json<string[]>().parse(raw)).toEqual(raw)
      expect(codecs.arrayOf(codecs.json<{ id: number }>()).parse(raw)).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('preserves JSON absence and rejects invalid text', () => {
      const codec = codecs.json()

      expect(codec.parse(null)).toBeUndefined()
      expect(codec.parse(undefined)).toBeUndefined()
      expect(codec.parse('')).toBeUndefined()
      expect(codec.parse('invalid')).toBeUndefined()
      expect(codec.parse('null')).toBeNull()
    })

    it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects %s before calling the validator', (raw) => {
      const validate = vi.fn(() => ({ id: 1 }))

      expect(codecs.json({ validate }).parse(raw)).toBeUndefined()
      expect(validate).not.toHaveBeenCalled()
    })
  })
})
