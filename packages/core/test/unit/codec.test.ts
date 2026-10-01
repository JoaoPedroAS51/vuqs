import type { Codec } from '../../src/core/codec'
import type { ParsedQueryValue } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { codecs, createCodec } from '../../src/core/codec'
import { isCodecBijective } from '../../src/testing'

function codecCase<T>(name: string, codec: Codec<T>, raw: ParsedQueryValue, expected: T) {
  return { name, parse: (raw: ParsedQueryValue) => codec.parse(raw), raw, expected }
}

describe('codecs.string', () => {
  it('parses and serializes', () => {
    expect(codecs.string.parse('phone')).toBe('phone')
    expect(codecs.string.serialize('phone')).toBe('phone')
  })

  it('parses absent as undefined', () => {
    expect(codecs.string.parse(undefined)).toBeUndefined()
    expect(codecs.string.parse('')).toBeUndefined()
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.string, 'phone', 'phone')).toBe(true)
  })
})

describe('codecs.integer', () => {
  it('parses valid integers', () => {
    expect(codecs.integer.parse('42')).toBe(42)
  })

  it('rejects non-numeric values', () => {
    expect(codecs.integer.parse('abc')).toBeUndefined()
    expect(codecs.integer.parse(undefined)).toBeUndefined()
  })

  it('rejects partial-numeric and non-decimal values', () => {
    expect(codecs.integer.parse('42abc')).toBeUndefined()
    expect(codecs.integer.parse('4.5')).toBeUndefined()
    expect(codecs.integer.parse('0x10')).toBeUndefined()
  })

  it('serializes as a string', () => {
    expect(codecs.integer.serialize(42)).toBe('42')
    expect(codecs.integer.serialize(42.9)).toBe('42')
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
    expect(isCodecBijective(codecs.integer, '-7', -7)).toBe(true)
  })
})

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

describe('codecs.hex', () => {
  it('parses hexadecimal values', () => {
    expect(codecs.hex.parse('ff')).toBe(255)
    expect(codecs.hex.parse('FF')).toBe(255)
    expect(codecs.hex.parse('10')).toBe(16)
  })

  it('rejects non-hex values', () => {
    expect(codecs.hex.parse('gg')).toBeUndefined()
    expect(codecs.hex.parse('0xff')).toBeUndefined()
    expect(codecs.hex.parse(undefined)).toBeUndefined()
  })

  it('serializes and pads to even length', () => {
    expect(codecs.hex.serialize(255)).toBe('ff')
    expect(codecs.hex.serialize(10)).toBe('0a')
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.hex, 'ff', 255)).toBe(true)
    expect(isCodecBijective(codecs.hex, '0a', 10)).toBe(true)
  })
})

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

describe('codecs.numberLiteral', () => {
  const level = codecs.numberLiteral([1, 2, 3])

  it('parses values in the set', () => {
    expect(level.parse('1')).toBe(1)
    expect(level.parse('3')).toBe(3)
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

describe('codecs.float', () => {
  it('parses decimals and scientific notation', () => {
    expect(codecs.float.parse('4.5')).toBe(4.5)
    expect(codecs.float.parse('1e3')).toBe(1000)
  })

  it('rejects non-finite and partial-numeric values', () => {
    expect(codecs.float.parse('Infinity')).toBeUndefined()
    expect(codecs.float.parse('-Infinity')).toBeUndefined()
    expect(codecs.float.parse('NaN')).toBeUndefined()
    expect(codecs.float.parse('4.5abc')).toBeUndefined()
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.float, '4.5', 4.5)).toBe(true)
  })
})

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

describe('codecs.arrayOf', () => {
  const numbers = codecs.arrayOf(codecs.integer)

  it('parses each item', () => {
    expect(numbers.parse(['1', '2', '3'])).toEqual([1, 2, 3])
  })

  it('drops invalid items and treats empty as absent', () => {
    expect(numbers.parse(['1', 'x', '2'])).toEqual([1, 2])
    expect(numbers.parse(['x'])).toBeUndefined()
  })

  it('treats a scalar raw value as a single-item array', () => {
    expect(numbers.parse('5')).toEqual([5])
  })

  it('treats an absent raw value as no items', () => {
    expect(numbers.parse(undefined)).toBeUndefined()
    expect(numbers.parse(null)).toBeUndefined()
  })

  it('serializes each item', () => {
    expect(numbers.serialize([1, 2])).toEqual(['1', '2'])
  })

  it('compares element-wise', () => {
    expect(numbers.eq([1, 2], [1, 2])).toBe(true)
    expect(numbers.eq([1, 2], [1, 3])).toBe(false)
  })

  it('is bijective', () => {
    expect(isCodecBijective(numbers, ['1', '2', '3'], [1, 2, 3])).toBe(true)
  })
})

describe('codecs.literal', () => {
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

describe('codecs.json', () => {
  const json = codecs.json<{ a: number }>()

  it('round-trips', () => {
    expect(json.parse('{"a":1}')).toEqual({ a: 1 })
    expect(json.serialize({ a: 1 })).toBe('{"a":1}')
  })

  it('is bijective', () => {
    expect(isCodecBijective(json, '{"a":1}', { a: 1 })).toBe(true)
  })

  it('parses invalid json as undefined', () => {
    expect(json.parse('{')).toBeUndefined()
  })

  it('parses an absent raw value as undefined', () => {
    expect(json.parse(undefined)).toBeUndefined()
  })

  it('treats validator failures as absent', () => {
    const validated = codecs.json<number>({
      validate: (value) => {
        if (typeof value !== 'number') {
          throw new TypeError('not a number')
        }

        return value
      },
    })

    expect(validated.parse('5')).toBe(5)
    expect(validated.parse('"x"')).toBeUndefined()
  })
})

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
