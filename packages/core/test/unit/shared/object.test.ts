import { describe, expect, it } from 'vitest'
import { definedOnly, omitBy, pickBy, structuralClone, structuralEq } from '../../../src/shared/utils/object'

describe('structuralEq', () => {
  it('compares primitives with Object.is', () => {
    expect(structuralEq(1, 1)).toBe(true)
    expect(structuralEq('a', 'a')).toBe(true)
    expect(structuralEq(Number.NaN, Number.NaN)).toBe(true)
    expect(structuralEq(1, 2)).toBe(false)
  })

  it('treats null and a non-object as unequal to an object', () => {
    expect(structuralEq(null, {})).toBe(false)
    expect(structuralEq({}, null)).toBe(false)
    expect(structuralEq('a', { a: 1 })).toBe(false)
  })

  it('compares arrays by index, recursively', () => {
    expect(structuralEq([1, [2, 3]], [1, [2, 3]])).toBe(true)
    expect(structuralEq([1, 2], [1, 2, 3])).toBe(false)
    expect(structuralEq([1, 2], [1, 3])).toBe(false)
  })

  it('treats an array and a plain object as unequal', () => {
    expect(structuralEq([1, 2], { 0: 1, 1: 2 })).toBe(false)
    expect(structuralEq({ 0: 1, 1: 2 }, [1, 2])).toBe(false)
  })

  it('compares plain objects by key, recursively', () => {
    expect(structuralEq({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true)
    expect(structuralEq({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(structuralEq({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('structuralClone', () => {
  it('returns primitives as-is', () => {
    expect(structuralClone(1)).toBe(1)
    expect(structuralClone(null)).toBe(null)
    expect(structuralClone('a')).toBe('a')
  })

  it('rebuilds a Date into an independent instance', () => {
    const date = new Date(2026, 0, 1)
    const clone = structuralClone(date)

    expect(clone).toEqual(date)
    expect(clone).not.toBe(date)

    clone.setFullYear(1999)
    expect(date.getFullYear()).toBe(2026)
  })

  it('clones an array recursively', () => {
    const source = [{ a: 1 }, { a: 2 }]
    const clone = structuralClone(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone[0]).not.toBe(source[0])
  })

  it('clones a plain object recursively', () => {
    const source = { a: { b: 1 } }
    const clone = structuralClone(source)

    expect(clone).toEqual(source)
    clone.a.b = 999
    expect(source.a.b).toBe(1)
  })
})

describe('pickBy / omitBy', () => {
  it('pickBy keeps the matching keys', () => {
    expect(pickBy(key => key.startsWith('a'))({ a1: 1, a2: 2, b: 3 })).toEqual({ a1: 1, a2: 2 })
  })

  it('omitBy drops the matching keys', () => {
    expect(omitBy(key => key.startsWith('a'))({ a1: 1, a2: 2, b: 3 })).toEqual({ b: 3 })
  })

  it('definedOnly drops undefined-valued keys', () => {
    expect(definedOnly({ a: 1, b: undefined, c: 0 })).toEqual({ a: 1, c: 0 })
  })
})
