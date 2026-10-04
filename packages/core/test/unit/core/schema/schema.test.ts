import { describe, expect, it } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { defineQuerySchema, getManagedKeys } from '../../../../src/core/schema/schema'

const schema = {
  currency: queryParam('currency', codecs.string),
  sort: queryParam('filters.sort', codecs.string),
  statuses: queryParam('filters.statuses', codecs.arrayOf(codecs.string)),
}

describe('defineQuerySchema', () => {
  it('normalizes a codec with an incidental paths property', () => {
    const codec = { ...codecs.string, paths: ['other'] }
    const normalized = defineQuerySchema({ q: codec })

    expect(normalized.q).not.toBe(codec)
    expect(normalized.q.paths).toEqual(['q'])
    expect(normalized.q.read({ q: 'selected', other: 'ignored' })).toBe('selected')
  })

  it('normalizes codec-shorthand entries and passes defined params through', () => {
    const filters = defineQuerySchema({
      q: codecs.string,
      status: queryParam('status', codecs.literal(['open', 'closed'] as const)),
    })

    expect(filters.q.paths).toEqual(['q'])
    expect(filters.q.read({ q: 'phone' })).toBe('phone')
    expect(filters.status.read({ status: 'open' })).toBe('open')
  })
})

describe('getManagedKeys', () => {
  it('returns every managed path', () => {
    expect(getManagedKeys(schema)).toEqual(['currency', 'filters.sort', 'filters.statuses'])
  })
})
