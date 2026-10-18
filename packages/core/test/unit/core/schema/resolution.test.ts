import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../src/core/codecs/codec'
import { createDefinedQueryParam, getParamStructure } from '../../../../src/core/schema/params/definition'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import {
  classifyDefault,
  composeDefaultCandidates,
  composeParamDefaults,
  projectDefaultCandidates,
  resolveParamValue,
  resolveQueryStateValues,
} from '../../../../src/core/schema/resolution'
import { defineQuerySchema } from '../../../../src/core/schema/schema'

const staticCandidate = (param: Parameters<typeof getParamStructure>[0]) => getParamStructure(param)?.staticCandidate

describe('composeParamDefaults', () => {
  const record = queryParam.object({
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer),
    c: queryParam('c', codecs.integer.withDefault(2)),
  })

  it('ignores a contribution that is not an object for an object param', () => {
    const lower = staticCandidate(record)

    expect(composeParamDefaults(record, lower, 'not an object')).toBe(lower)
  })

  it('keeps a nested object without its own default out of the composed value', () => {
    const container = queryParam.object({
      inner: queryParam.object({ x: queryParam('x', codecs.integer) }),
      flag: queryParam('flag', codecs.boolean.withDefault(false)),
    })
    const composed = composeParamDefaults(container, staticCandidate(container), { flag: true })

    expect(composed?.value).toEqual({ flag: true })
    expect(composed?.children?.inner?.value).toBeUndefined()
  })

  it('returns the lower candidate when the layer contributes nothing', () => {
    const lower = staticCandidate(record)

    expect(composeParamDefaults(record, lower, undefined)).toBe(lower)
  })

  it('keeps lower children for omitted or undefined paths and overrides defined ones', () => {
    const composed = composeParamDefaults(record, staticCandidate(record), { a: 99, c: undefined })

    expect(composed?.value).toEqual({ a: 99, c: 2 })
    expect(composed?.direct).toBe(true)
  })

  it('treats an empty contribution as a direct object source', () => {
    const container = queryParam.object({
      record: queryParam.object({ a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent(),
    })
    const inherited = staticCandidate(container)
    const direct = composeParamDefaults(container, inherited, {})

    expect(inherited?.direct).toBe(false)
    expect(inherited?.value).toEqual({ record: { a: 1 } })
    expect(direct?.direct).toBe(true)
    expect(direct?.value).toEqual({ record: { a: 1 } })
  })

  it('replaces atomic values as a whole and lets null override', () => {
    const list = queryParam('list', codecs.arrayOf(codecs.integer)).withDefault([1, 2])
    const nullable = queryParam('n', codecs.integer.nullable().withDefault(2))

    expect(composeParamDefaults(list, staticCandidate(list), [])?.value).toEqual([])
    expect(composeParamDefaults(nullable, staticCandidate(nullable), null)?.value).toBeNull()
    expect(composeParamDefaults(nullable, staticCandidate(nullable), undefined)?.value).toBe(2)
  })

  it('folds later sources over earlier ones per child', () => {
    const schema = { record }
    const candidates = composeDefaultCandidates(schema, ['record'], [{ record: { a: 5, b: 20 } }, { record: { a: 99 } }])

    expect(projectDefaultCandidates(candidates)).toEqual({ record: { a: 99, b: 20, c: 2 } })
    expect(projectDefaultCandidates(composeDefaultCandidates(schema, ['record'], [{ record: { a: 5, b: 20 } }]))).toEqual({
      record: { a: 5, b: 20, c: 2 },
    })
  })
})

describe('resolveParamValue', () => {
  const record = queryParam.object({
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer),
  })

  it('fills omitted children of a present object from the candidate without touching the explicit value', () => {
    const explicit = { b: 10 }

    expect(resolveParamValue(record, explicit, staticCandidate(record))).toEqual({ a: 0, b: 10 })
    expect(explicit).toEqual({ b: 10 })
  })

  it('keeps a gated object absent without explicit presence even with a direct contribution', () => {
    const gated = record.withDefaultsWhenPresent().withDefault({})
    const candidate = composeParamDefaults(gated, staticCandidate(gated), {})

    expect(resolveParamValue(gated, undefined, candidate)).toBeUndefined()
    expect(resolveParamValue(gated, { b: 1 }, candidate)).toEqual({ a: 0, b: 1 })
  })

  it('does not create an object from candidates that only gated descendants hold', () => {
    const container = queryParam.object({
      record: queryParam.object({ a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent(),
    })

    expect(resolveParamValue(container, undefined, staticCandidate(container))).toBeUndefined()
    expect(resolveParamValue(container, undefined, composeParamDefaults(container, staticCandidate(container), {}))).toEqual({})
  })

  it('returns a clone so consumers cannot mutate the candidate', () => {
    const list = queryParam('list', codecs.arrayOf(codecs.integer)).withDefault([1])
    const candidate = staticCandidate(list)
    const resolved = resolveParamValue(list, undefined, candidate) as number[]

    resolved.push(2)

    expect(resolveParamValue(list, undefined, candidate)).toEqual([1])
  })

  it('passes absence and the applicable default to an internal param resolver', () => {
    const custom = createDefinedQueryParam<number>({
      paths: ['n'],
      read: () => undefined,
      write: value => ({ n: value }),
      resolve: (explicit: number | undefined, defaultValue: number | undefined) => explicit ?? defaultValue ?? -1,
    })

    expect(resolveParamValue(custom, undefined, undefined)).toBe(-1)
    expect(resolveParamValue(custom, undefined, { value: 10, direct: true })).toBe(10)
    expect(resolveParamValue(custom, 3, { value: 10, direct: true })).toBe(3)
  })
})

describe('resolveQueryStateValues', () => {
  it('resolves custom codec defaults through normalization, nesting and prefixing', () => {
    const codec = createCodec<number>({
      parse: raw => typeof raw === 'number' ? raw : undefined,
      serialize: value => value,
    })
    const child = queryParam('child', codec.withDefault(10))
    const record = queryParam.object({ child, other: codecs.string })
    const prefixed = queryParam.object('prefix', record)
    const schema = defineQuerySchema({ root: codec.withDefault(10), record, prefixed, absent: codec })
    const keys = ['root', 'record', 'prefixed', 'absent'] as const
    const candidates = composeDefaultCandidates(schema, keys, [])

    expect(resolveQueryStateValues(schema, keys, {
      record: record.read({ other: 'x' }),
      prefixed: prefixed.read({ prefix: { other: 'x' } }),
    }, candidates)).toEqual({
      root: 10,
      record: { child: 10, other: 'x' },
      prefixed: { child: 10, other: 'x' },
    })
    expect(resolveQueryStateValues(schema, keys, { root: 3 }, candidates).root).toBe(3)
  })

  it('resolves every captured key and omits absent results', () => {
    const schema = {
      page: queryParam('page', codecs.integer.withDefault(1)),
      q: queryParam('q', codecs.string),
    }
    const candidates = composeDefaultCandidates(schema, ['page', 'q'], [])

    expect(resolveQueryStateValues(schema, ['page', 'q'], { q: 'x' }, candidates)).toEqual({ page: 1, q: 'x' })
    expect(resolveQueryStateValues(schema, ['page', 'q'], {}, candidates)).toEqual({ page: 1 })
  })
})

describe('classifyDefault', () => {
  const record = queryParam.object({
    a: queryParam('a', codecs.integer),
    b: queryParam('b', codecs.integer),
  })

  it('classifies partial and complete explicit values against a complete candidate', () => {
    expect(classifyDefault(record, { b: 10 }, { a: 0, b: 10 })).toBe('different')
    expect(classifyDefault(record, { a: 0, b: 10 }, { a: 0, b: 10 })).toBe('equal')
  })

  it('separates absence from a missing candidate without calling equality', () => {
    const eq = (a: number | null, b: number | null) => {
      expect(a).not.toBeUndefined()
      expect(b).not.toBeUndefined()
      return a === b
    }
    const param = queryParam('n', codecs.integer.nullable()).withEquality(eq)

    expect(classifyDefault(param, undefined, 1)).toBe('absent')
    expect(classifyDefault(param, 1, undefined)).toBe('no-default')
    expect(classifyDefault(param, null, null)).toBe('equal')
  })

  it('is unaffected by presence gates and retention options', () => {
    const configured = record.withDefaultsWhenPresent().keepOnDefault()

    expect(classifyDefault(configured, { a: 0, b: 10 }, { a: 0, b: 10 })).toBe('equal')
  })
})
