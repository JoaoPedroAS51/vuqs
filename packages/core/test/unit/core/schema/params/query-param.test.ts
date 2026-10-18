import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../../src/core/schema/params/query-param'

describe('queryParam', () => {
  it('defines a scalar param from a path and codec', () => {
    const page = queryParam('page', codecs.integer)

    expect(page.paths).toEqual(['page'])
    expect(page.read({ page: '2' })).toBe(2)
    expect(page.write(2)).toEqual({ page: '2' })
  })

  it('defaults to a plain string param when given no codec or options', () => {
    const q = queryParam('q')

    expect(q.defaultValue).toBeUndefined()
    expect(q.read({ q: 'phone' })).toBe('phone')
    expect(q.write('phone')).toEqual({ q: 'phone' })
  })

  it('supports string shorthand defaults', () => {
    const q = queryParam('q', { defaultValue: 'all' })

    expect(q.defaultValue).toBe('all')
  })

  it('supports local defaults and equality', () => {
    const date = queryParam('date', codecs.isoDate)
      .withDefault(new Date('2026-01-01'))
      .withEquality((a, b) => a.valueOf() === b.valueOf())

    expect(date.defaultValue).toEqual(new Date('2026-01-01'))
    expect(date.eq(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(true)
  })

  it('reads explicit values, omitting an absent defaulted param', () => {
    const page = queryParam('page', codecs.integer).withDefault(2)

    expect(page.defaultValue).toBe(2)
    expect(page.read({})).toBeUndefined()
    expect(page.read({ page: '5' })).toBe(5)
  })

  it('reads an invalid value as absent, not as its default', () => {
    const page = queryParam('page', codecs.integer).withDefault(2)

    expect(page.read({ page: 'bad' })).toBeUndefined()
  })

  it('overrides the codec default with the builder default', () => {
    const page = queryParam('page', codecs.integer.withDefault(1)).withDefault(2)

    expect(page.defaultValue).toBe(2)
    expect(page.read({ page: '5' })).toBe(5)
  })

  it('applies a withDefault override placed after transform', () => {
    const t = queryParam('n', codecs.integer.withDefault(5))
      .transform<string>({ read: v => `#${v}`, write: v => Number(v.slice(1)) })
      .withDefault('#99')

    expect(t.defaultValue).toBe('#99')
    expect(t.read({})).toBeUndefined()
    expect(t.read({ n: '7' })).toBe('#7')
  })

  it('replaces earlier scalar defaults and leaves previous variants untouched', () => {
    const base = queryParam('page', codecs.integer.withDefault(1))
    const first = base.withDefault(2)
    const second = first.withDefault(3)

    expect(base.defaultValue).toBe(1)
    expect(first.defaultValue).toBe(2)
    expect(second.defaultValue).toBe(3)
  })

  it('lets a supported null replace a codec default', () => {
    const page = queryParam('page', codecs.integer.nullable().withDefault(2))

    expect(page.withDefault(null).defaultValue).toBeNull()
    expect(page.defaultValue).toBe(2)
  })

  it('derives the transformed default only from a defined transform of the input default', () => {
    const rejected = queryParam('n', codecs.integer.withDefault(0))
      .transform<string>({ read: v => (v > 0 ? `#${v}` : undefined), write: v => Number(v.slice(1)) })
    const accepted = queryParam('n', codecs.integer.withDefault(5))
      .transform<string>({ read: v => (v > 0 ? `#${v}` : undefined), write: v => Number(v.slice(1)) })

    expect(rejected.defaultValue).toBeUndefined()
    expect(accepted.defaultValue).toBe('#5')
    expect(accepted.withDefault('#99').read({ n: '7' })).toBe('#7')
  })

  it('keeps a transformed output atomic when an output default replaces the derived one', () => {
    const t = queryParam('n', codecs.integer.withDefault(5))
      .transform<{ a: number, b: number }>({
        read: v => ({ a: v, b: 100 }),
        write: v => v.a,
      })
      .withDefault({ a: 1, b: 1 })

    expect(t.defaultValue).toEqual({ a: 1, b: 1 })
  })

  it('keeps a custom input equality when a scalar param is transformed', () => {
    const rounded = queryParam('n', codecs.float)
      .withEquality((a, b) => Math.round(a) === Math.round(b))
      .transform<string>({ read: value => `#${value}`, write: value => Number(value.slice(1)) })

    expect(rounded.eq('#1.1', '#1.2')).toBe(true)
    expect(rounded.eq('#1.1', '#3')).toBe(false)
  })
})
