import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { normalizeForHistory } from '../../../../src/core/diagnostics/normalize'

const wideLimits = { maxDepth: 6, maxProps: 64, maxItems: 128, maxStringLength: 4096, maxNodes: 4096 }

describe('normalizeForHistory', () => {
  it('drops functions and symbols', () => {
    expect(normalizeForHistory({ fn: () => 1, sym: Symbol('s'), keep: 1 })).toEqual({ keep: 1 })
  })

  it('reduces an Error to reportable fields', () => {
    const normalized = normalizeForHistory(new Error('bad')) as { name: string, message: string }
    expect(normalized.name).toBe('Error')
    expect(normalized.message).toBe('bad')
  })

  it('breaks cycles', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    expect(normalizeForHistory(cyclic)).toEqual({ a: 1, self: '[Circular]' })
  })

  it('truncates long strings', () => {
    const normalized = normalizeForHistory('x'.repeat(5000), { maxDepth: 6, maxProps: 64, maxItems: 128, maxStringLength: 10, maxNodes: 4096 }) as string
    expect(normalized).toBe(`${'x'.repeat(10)}…`)
  })

  it('summarizes arrays past the item limit', () => {
    const normalized = normalizeForHistory([1, 2, 3, 4], { maxDepth: 6, maxProps: 64, maxItems: 2, maxStringLength: 4096, maxNodes: 4096 }) as unknown[]
    expect(normalized).toEqual([1, 2, '[+2 more]'])
  })
})

describe('normalizeForHistory: value kinds', () => {
  it('unwraps refs and reactive proxies', () => {
    expect(normalizeForHistory(ref({ a: 1 }))).toEqual({ a: 1 })
    expect(normalizeForHistory(reactive({ a: 1 }))).toEqual({ a: 1 })
  })

  it('keeps bigint and formats dates and regexps', () => {
    expect(normalizeForHistory(10n)).toBe(10n)
    expect(normalizeForHistory(new Date('2026-06-22T00:00:00.000Z'))).toBe('2026-06-22T00:00:00.000Z')
    expect(normalizeForHistory(new Date('invalid'))).toBe('Invalid Date')
    expect(normalizeForHistory(/ab+c/gi)).toBe('/ab+c/gi')
  })

  it('normalizes Map and Set', () => {
    expect(normalizeForHistory(new Map([['a', 1]]))).toEqual({ '[Map]': [['a', 1]] })
    expect(normalizeForHistory(new Set([1, 2]))).toEqual({ '[Set]': [1, 2] })
  })

  it('summarizes Map and Set past the item limit', () => {
    const limits = { ...wideLimits, maxItems: 1 }
    expect(normalizeForHistory(new Map([['a', 1], ['b', 2]]), limits)).toEqual({ '[Map]': [['a', 1], '[+1 more]'] })
    expect(normalizeForHistory(new Set([1, 2]), limits)).toEqual({ '[Set]': [1, '[+1 more]'] })
  })

  it('summarizes past maxProps and maxDepth', () => {
    const wide = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`k${index}`, index]))
    const narrow = normalizeForHistory(wide, { ...wideLimits, maxProps: 2 }) as Record<string, unknown>
    expect(Object.keys(narrow)).toHaveLength(3)
    expect(narrow['…']).toBe('[truncated]')

    const deep = normalizeForHistory({ a: { b: 1 } }, { ...wideLimits, maxDepth: 1 }) as { a: unknown }
    expect(deep.a).toBe('[MaxDepth]')
  })

  it('stops at the node budget', () => {
    expect(normalizeForHistory({ a: 1 }, { ...wideLimits, maxNodes: 0 })).toBe('[Budget]')
  })

  it('skips inherited enumerable properties', () => {
    const object = Object.create({ inherited: 'x' })
    object.own = 1

    expect(normalizeForHistory(object)).toEqual({ own: 1 })
  })

  it('bounds scanning of a large inherited key set by the node budget', () => {
    const proto: Record<string, number> = {}
    for (let i = 0; i < 50; i++) {
      proto[`p${i}`] = i
    }
    const object = Object.create(proto)
    object.own = 1

    // A tiny budget must stop the scan long before every inherited key is examined.
    const result = normalizeForHistory(object, { ...wideLimits, maxProps: 1, maxNodes: 2 }) as Record<string, unknown>
    expect(result['…']).toBe('[truncated]')
  })

  it('keeps a hostile __proto__ key as data without polluting the prototype', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true}}')
    const normalized = normalizeForHistory(hostile) as Record<string, unknown>

    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype)
    expect(Object.hasOwn(normalized, '__proto__')).toBe(true)
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('recovers from a throwing getter', () => {
    const object = {}
    Object.defineProperty(object, 'boom', { enumerable: true, get() {
      throw new Error('getter')
    } })

    expect(normalizeForHistory(object)).toEqual({ boom: '[Unreadable]' })
  })

  it('caps the error message length', () => {
    const normalized = normalizeForHistory(new Error('y'.repeat(50)), { ...wideLimits, maxStringLength: 10 }) as { message: string }
    expect(normalized.message).toBe(`${'y'.repeat(10)}…`)
  })

  it('passes null through', () => {
    expect(normalizeForHistory(null)).toBeNull()
    expect(normalizeForHistory({ a: null })).toEqual({ a: null })
  })

  it('handles an error without a stack', () => {
    const error = new Error('no stack')
    Object.defineProperty(error, 'stack', { value: undefined })
    const normalized = normalizeForHistory(error) as { stack?: string }
    expect(normalized.stack).toBeUndefined()
  })
})
