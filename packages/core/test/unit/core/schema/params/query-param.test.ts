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

  it('reads a pure selection, omitting an absent defaulted param', () => {
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
})
