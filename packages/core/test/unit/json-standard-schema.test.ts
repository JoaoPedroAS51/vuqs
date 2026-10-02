import type { StandardSchemaV1 } from '@standard-schema/spec'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { codecs } from '../../src/core/codec'

function schema<T>(validate: StandardSchemaV1.Props<unknown, T>['validate']): StandardSchemaV1<unknown, T> {
  return { '~standard': { version: 1, vendor: 'test', validate } }
}

describe('codecs.json with Standard Schema', () => {
  it.each([
    { raw: '{"id":1}', expected: { id: 1 } },
    { raw: { id: 1 }, expected: { id: 1 } },
    { raw: [{ id: 1 }], expected: [{ id: 1 }] },
  ])('validates the complete decoded value once', ({ raw, expected }) => {
    const validate = vi.fn((value: unknown) => ({ value }))
    const codec = codecs.json({ validate: schema(validate) })

    expect(codec.parse(raw)).toEqual(expected)
    expect(validate).toHaveBeenCalledExactlyOnceWith(expected)
  })

  it('returns the schema output', () => {
    const codec = codecs.json({ validate: schema(value => ({ value: { label: String(value) } })) })

    expect(codec.parse('42')).toEqual({ label: '42' })
    expect(codec.serialize({ label: '42' })).toBe('{"label":"42"}')
  })

  it('uses the Standard Schema interface on callable schemas', () => {
    const callback = vi.fn(() => {
      throw new Error('unexpected callback')
    })
    const validate = vi.fn(() => ({ value: { id: 1 } }))
    const callable = Object.assign(callback, schema(validate))

    expect(codecs.json({ validate: callable }).parse('{"id":1}')).toEqual({ id: 1 })
    expect(validate).toHaveBeenCalledOnce()
    expect(callback).not.toHaveBeenCalled()
  })

  it('treats issues as absent, including an empty issue list', () => {
    for (const issues of [[], [{ message: 'invalid', path: ['id'] }]]) {
      expect(codecs.json({ validate: schema(() => ({ issues })) }).parse('{"id":1}')).toBeUndefined()
    }
  })

  it('treats schema throws as absent', () => {
    const codec = codecs.json({ validate: schema(() => {
      throw new Error('invalid')
    }) })

    expect(codec.parse('{"id":1}')).toBeUndefined()
  })

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 'invalid'])('skips validation for %s', (raw) => {
    const validate = vi.fn((value: unknown) => ({ value }))

    expect(codecs.json({ validate: schema(validate) }).parse(raw)).toBeUndefined()
    expect(validate).not.toHaveBeenCalled()
  })

  it('keeps defaults outside validation', () => {
    const validate = vi.fn((value: unknown) => ({ value }))
    const codec = codecs.json({ validate: schema(validate) }).withDefault({ id: 1 })

    expect(codec.parse(undefined)).toBeUndefined()
    expect(codec.defaultValue).toEqual({ id: 1 })
    expect(validate).not.toHaveBeenCalled()
  })

  it('accepts synchronous results with a non-function then property', () => {
    const codec = codecs.json({ validate: schema(() => ({ value: 1, then: 'metadata' })) })

    expect(codec.parse('1')).toBe(1)
  })

  it.each([
    { name: 'resolved', validate: () => Promise.resolve({ value: 1 }) },
    { name: 'rejected', validate: () => Promise.reject(new Error('async failure')) },
    { name: 'another realm', validate: () => runInNewContext('Promise.resolve({ value: 1 })') as Promise<{ value: number }> },
  ])('throws for $name asynchronous validation', async ({ validate }) => {
    const codec = codecs.json({ validate: schema(validate) })

    expect(() => codec.parse('1')).toThrow('Standard Schema validation must be synchronous')
    await Promise.resolve()
  })
})
