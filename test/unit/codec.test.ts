import { describe, expect, it } from 'vitest'
import { codecs, createCodec } from '../../src/core/codec'

describe('codecs.string', () => {
  it('parses and serializes', () => {
    expect(codecs.string.parse('lease')).toBe('lease')
    expect(codecs.string.serialize('lease')).toBe('lease')
  })

  it('parses absent as undefined', () => {
    expect(codecs.string.parse(undefined)).toBeUndefined()
    expect(codecs.string.parse('')).toBeUndefined()
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
})

describe('codecs.literal', () => {
  const sort = codecs.literal(['asc', 'desc'])

  it('parses allowed values', () => {
    expect(sort.parse('asc')).toBe('asc')
  })

  it('rejects disallowed values', () => {
    expect(sort.parse('sideways')).toBeUndefined()
  })
})

describe('codecs.json', () => {
  const json = codecs.json<{ a: number }>()

  it('round-trips', () => {
    expect(json.parse('{"a":1}')).toEqual({ a: 1 })
    expect(json.serialize({ a: 1 })).toBe('{"a":1}')
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
