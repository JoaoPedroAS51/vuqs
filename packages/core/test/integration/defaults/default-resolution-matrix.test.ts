import type { FlatCase, IdentityCase, NestedCase } from './default-resolution-matrix.helpers'
import { describe, expect, it } from 'vitest'
import {
  expectFlat,
  expectIdentity,
  expectNested,
  flatCases,
  identityCases,
  nestedCases,
  runFlat,
  runIdentity,
  runNested,
} from './default-resolution-matrix.helpers'

// The oracle is checked against handwritten expectations first, so a wrong oracle cannot
// silently agree with wrong production behavior.
describe('default resolution matrix oracle anchors', () => {
  it('derives handwritten flat expectations', () => {
    const base: FlatCase = { label: '', urls: ['absent', 'absent'], statics: [true, true], own: 'none', gated: false, runtime: 'none' }

    expect(expectFlat({ ...base }).resolved).toEqual({ a: 1, b: 2 })
    expect(expectFlat({ ...base, runtime: 'partial' }).resolved).toEqual({ a: 20, b: 2 })
    expect(expectFlat({ ...base, own: 'partial', runtime: 'partial' }).resolved).toEqual({ a: 20, b: 2 })
    expect(expectFlat({ ...base, own: 'partial' }).resolved).toEqual({ a: 10, b: 2 })
    expect(expectFlat({ ...base, urls: ['absent', 'valid'], runtime: 'full' })).toEqual({
      explicit: { b: 31 },
      resolved: { a: 20, b: 31 },
    })
    expect(expectFlat({ ...base, gated: true, own: 'partial', runtime: 'full' })).toEqual({
      explicit: undefined,
      resolved: undefined,
    })
    expect(expectFlat({ ...base, urls: ['invalid', 'absent'], statics: [false, false] })).toEqual({
      explicit: undefined,
      resolved: undefined,
    })
    expect(expectFlat({ ...base, statics: [false, false], own: 'partial' }).resolved).toEqual({ a: 10 })
  })

  it('derives handwritten nested expectations', () => {
    const base: NestedCase = {
      label: '',
      urls: [false, false, false],
      statics: [true, true, true],
      rootOwn: false,
      innerOwn: false,
      rootGated: false,
      innerGated: false,
      runtime: 'none',
    }

    expect(expectNested(base).resolved).toEqual({ x: 1, inner: { y: 2, z: 3 } })
    expect(expectNested({ ...base, rootOwn: true, innerOwn: true }).resolved).toEqual({
      x: 100,
      inner: { y: 101, z: 111 },
    })
    expect(expectNested({ ...base, runtime: 'partial', rootOwn: true, innerOwn: true }).resolved).toEqual({
      x: 200,
      inner: { y: 201, z: 111 },
    })
    expect(expectNested({ ...base, innerGated: true, runtime: 'full' }).resolved).toEqual({ x: 200 })
    expect(expectNested({ ...base, innerGated: true, urls: [false, false, true], runtime: 'partial' })).toEqual({
      explicit: { inner: { z: 32 } },
      resolved: { x: 200, inner: { y: 201, z: 32 } },
    })
    expect(expectNested({ ...base, statics: [false, false, false], innerGated: true, innerOwn: true }).resolved).toEqual(undefined)
    expect(expectNested({ ...base, statics: [false, false, false], rootOwn: true, innerGated: true }).resolved).toEqual({ x: 100 })
    expect(expectNested({ ...base, rootGated: true, rootOwn: true, runtime: 'full' }).resolved).toBeUndefined()
  })

  it('derives handwritten identity-transform expectations', () => {
    const base: IdentityCase = { label: '', urls: ['absent', 'absent'], statics: [true, true], runtime: 'none' }

    expect(expectIdentity(base)).toEqual({ explicit: undefined, resolved: { a: 1, b: 2 } })
    expect(expectIdentity({ ...base, runtime: 'full' })).toEqual({ explicit: undefined, resolved: { a: 20, b: 21 } })
    expect(expectIdentity({ ...base, urls: ['absent', 'valid'], runtime: 'full' })).toEqual({
      explicit: { a: 1, b: 31 },
      resolved: { a: 1, b: 31 },
    })
    expect(expectIdentity({ ...base, statics: [false, false], urls: ['invalid', 'invalid'] }).resolved).toBeUndefined()
  })
})

describe('default resolution matrix', () => {
  describe('flat object', () => {
    const cases = flatCases()

    it('enumerates the bounded family', () => {
      expect(cases).toHaveLength(432)
      expect(new Set(cases.map(c => c.label)).size).toBe(432)
    })

    it.each(cases)('$label', (c) => {
      expect(runFlat(c)).toEqual(expectFlat(c))
    })
  })

  describe('nested objects', () => {
    const cases = nestedCases()

    it('enumerates the bounded family', () => {
      expect(cases).toHaveLength(3072)
      expect(new Set(cases.map(c => c.label)).size).toBe(3072)
    })

    it.each(cases)('$label', (c) => {
      expect(runNested(c)).toEqual(expectNested(c))
    })
  })

  describe('identity transform', () => {
    const cases = identityCases()

    it('enumerates the bounded family', () => {
      expect(cases).toHaveLength(72)
      expect(new Set(cases.map(c => c.label)).size).toBe(72)
    })

    it.each(cases)('$label', (c) => {
      expect(runIdentity(c)).toEqual(expectIdentity(c))
    })
  })
})
