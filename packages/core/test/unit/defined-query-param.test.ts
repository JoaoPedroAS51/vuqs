import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { setDebugSink } from '../../src/core/debug/sink'
import { createDefinedQueryParam } from '../../src/core/defined-query-param'
import { queryParam } from '../../src/core/query-param'

describe('defined query param write guard', () => {
  it('throws when write outputs outside the declared paths', () => {
    const broken = createDefinedQueryParam<{ from: string, to: string }>({
      paths: ['from'],
      read: () => undefined,
      write: value => ({ from: value.from, to: value.to }),
    })

    expect(() => broken.write({ from: 'a', to: 'b' })).toThrowError(/not in the declared paths/)
  })

  it('allows write output that stays within the declared paths', () => {
    const dateRange = createDefinedQueryParam<{ from: string, to: string }>({
      paths: ['from', 'to'],
      read: () => undefined,
      write: value => ({ from: value.from, to: value.to }),
    })

    expect(() => dateRange.write({ from: 'a', to: 'b' })).not.toThrow()
  })

  it('checks every call', () => {
    let mode: 'empty' | 'leak' = 'empty'
    const field = createDefinedQueryParam<string>({
      paths: ['from'],
      read: () => undefined,
      write: () => (mode === 'empty' ? {} : { from: 'x', leaked: 'y' }),
    })

    expect(() => field.write('a')).not.toThrow()

    mode = 'leak'

    expect(() => field.write('a')).toThrowError(/not in the declared paths/)
  })
})

describe('parse-miss warning dedupe', () => {
  it('warns once for a persistently malformed raw value', () => {
    const events: Array<[string, unknown[]]> = []
    setDebugSink((code, args) => events.push([code, args]))

    const count = queryParam('count', codecs.integer)
    count.read({ count: 'abc' })
    count.read({ count: 'abc' }) // same bad value again, deduped
    count.read({ count: 'def' }) // a different bad value warns again

    const parseMisses = events.filter(([code]) => code === 'engine:parse-miss')

    expect(parseMisses).toEqual([
      ['engine:parse-miss', ['count', 'abc']],
      ['engine:parse-miss', ['count', 'def']],
    ])

    setDebugSink(null)
  })
})
