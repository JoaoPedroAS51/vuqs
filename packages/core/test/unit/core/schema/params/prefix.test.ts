import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { joinPath, prefixQuery } from '../../../../../src/core/schema/params/prefix'
import { queryParam } from '../../../../../src/core/schema/params/query-param'

describe('joinPath', () => {
  it('joins a non-empty child path onto the prefix', () => {
    expect(joinPath('bounds', 'north')).toBe('bounds.north')
  })

  it('returns the prefix itself for an empty child path', () => {
    expect(joinPath('bounds', '')).toBe('bounds')
  })
})

describe('prefixQuery', () => {
  it('prefixes every leaf path in the query', () => {
    expect(prefixQuery({ north: '1', east: '2' }, 'bounds')).toEqual({
      bounds: { north: '1', east: '2' },
    })
  })

  it('drops a leaf whose value is explicitly undefined', () => {
    expect(prefixQuery({ north: '1', east: undefined }, 'bounds')).toEqual({
      bounds: { north: '1' },
    })
  })
})

describe('createPrefixedQueryParam', () => {
  const record = () => queryParam.object({
    a: queryParam('a', codecs.integer.withDefault(1)),
    b: queryParam('b', codecs.integer),
  })

  it('preserves the wrapped static candidate and presence gate', () => {
    const plain = queryParam.object('p', record().withDefault({ a: 5 }))
    const gated = queryParam.object('p', record().withDefaultsWhenPresent())

    expect(plain.defaultValue).toEqual({ a: 5 })
    expect(plain.presenceGated).toBe(false)
    expect(gated.defaultValue).toEqual({ a: 1 })
    expect(gated.presenceGated).toBe(true)
  })

  it('keeps an own contribution subject to the gate through prefix modifiers', () => {
    const gated = queryParam.object('p', record()).withDefault({ a: 7 }).withDefaultsWhenPresent()
    const reversed = queryParam.object('p', record()).withDefaultsWhenPresent().withDefault({ a: 7 })

    for (const param of [gated, reversed]) {
      expect(param.presenceGated).toBe(true)
      expect(param.defaultValue).toEqual({ a: 7 })
      expect(param.paths).toEqual(['p.a', 'p.b'])
    }
  })

  it('keeps an object default over child defaults after prefixing', () => {
    const prefixed = queryParam.object('p', record()).withDefault({ a: 9 })

    expect(prefixed.defaultValue).toEqual({ a: 9 })
  })
})
