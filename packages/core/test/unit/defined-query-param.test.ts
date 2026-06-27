import { describe, expect, it } from 'vitest'
import { createDefinedQueryParam } from '../../src/core/defined-query-param'

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
