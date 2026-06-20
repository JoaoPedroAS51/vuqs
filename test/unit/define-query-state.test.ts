import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'

describe('defineQueryState (path form)', () => {
  it('derives paths from the path', () => {
    expect(defineQueryState('currency', codecs.string).paths).toEqual(['currency'])
  })

  it('parses from the path', () => {
    const currency = defineQueryState('currency', codecs.string)

    expect(currency.parse({ currency: 'USD' })).toBe('USD')
    expect(currency.parse({})).toBeUndefined()
  })

  it('serializes into the path', () => {
    expect(defineQueryState('currency', codecs.string).serialize('USD')).toEqual({ currency: 'USD' })
  })

  it('supports nested dot-paths', () => {
    const sort = defineQueryState('filters.sort', codecs.string)

    expect(sort.parse({ filters: { sort: 'name' } })).toBe('name')
    expect(sort.serialize('name')).toEqual({ filters: { sort: 'name' } })
  })

  it('propagates the codec default', () => {
    expect(defineQueryState('page', codecs.integer.withDefault(1)).defaultValue).toBe(1)
  })
})

describe('defineQueryState (composite form)', () => {
  const dateRange = defineQueryState<{ from: string, to: string }>({
    paths: ['from', 'to'],
    parse: (query) => {
      const from = codecs.string.parse(query.from)
      const to = codecs.string.parse(query.to)

      return from && to ? { from, to } : undefined
    },
    serialize: value => ({ from: value.from, to: value.to }),
  })

  it('keeps the declared paths', () => {
    expect(dateRange.paths).toEqual(['from', 'to'])
  })

  it('parses and serializes across keys', () => {
    expect(dateRange.parse({ from: '2026-01-01', to: '2026-02-01' })).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
    })
    expect(dateRange.parse({ from: '2026-01-01' })).toBeUndefined()
    expect(dateRange.serialize({ from: 'a', to: 'b' })).toEqual({ from: 'a', to: 'b' })
  })

  it('defaults eq to structural equality', () => {
    expect(dateRange.eq({ from: 'a', to: 'b' }, { from: 'a', to: 'b' })).toBe(true)
    expect(dateRange.eq({ from: 'a', to: 'b' }, { from: 'a', to: 'c' })).toBe(false)
  })
})

describe('serialize dev guard', () => {
  it('throws when serialize writes outside the declared paths', () => {
    const broken = defineQueryState<{ from: string, to: string }>({
      paths: ['from'],
      parse: () => undefined,
      serialize: value => ({ from: value.from, to: value.to }),
    })

    expect(() => broken.serialize({ from: 'a', to: 'b' })).toThrowError(/not in the declared paths/)
  })

  it('allows serialize that stays within the declared paths', () => {
    const ok = defineQueryState('filters.sort', codecs.string)

    expect(() => ok.serialize('name')).not.toThrow()
  })

  it('checks every call, not only the first', () => {
    let mode: 'empty' | 'leak' = 'empty'
    const field = defineQueryState<string>({
      paths: ['from'],
      parse: () => undefined,
      serialize: () => (mode === 'empty' ? {} : { from: 'x', leaked: 'y' }),
    })

    expect(() => field.serialize('a')).not.toThrow()

    mode = 'leak'

    expect(() => field.serialize('a')).toThrowError(/not in the declared paths/)
  })

  it('allows a composite serialize that stays within the declared paths', () => {
    const dateRange = defineQueryState<{ from: string, to: string }>({
      paths: ['from', 'to'],
      parse: () => undefined,
      serialize: value => ({ from: value.from, to: value.to }),
    })

    expect(() => dateRange.serialize({ from: 'a', to: 'b' })).not.toThrow()
  })
})
