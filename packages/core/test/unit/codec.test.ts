import { describe, expect, it } from 'vitest'
import { codecs, createCodec } from '../../src/core/codec'
import { isCodecBijective } from '../../src/testing'

describe('codecs.string', () => {
  it('parses and serializes', () => {
    expect(codecs.string.parse('lease')).toBe('lease')
    expect(codecs.string.serialize('lease')).toBe('lease')
  })

  it('parses absent as undefined', () => {
    expect(codecs.string.parse(undefined)).toBeUndefined()
    expect(codecs.string.parse('')).toBeUndefined()
  })

  it('is bijective', () => {
    expect(isCodecBijective(codecs.string, 'lease', 'lease')).toBe(true)
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
    it('falls back to the default when absent', () => {
      const page = codecs.integer.withDefault(1)

      expect(page.parse(undefined)).toBe(1)
      expect(page.parse('3')).toBe(3)
    })

    it('exposes the default value', () => {
      expect(codecs.integer.withDefault(1).defaultValue).toBe(1)
    })

    it('does not mutate the base codec', () => {
      codecs.integer.withDefault(1)

      expect(codecs.integer.defaultValue).toBeUndefined()
      expect(codecs.integer.parse(undefined)).toBeUndefined()
    })
  })
})
