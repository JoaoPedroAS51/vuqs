import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryParam } from '../../src/core/define-query-param'
import { buildQuery, dropDefaults, getManagedKeys, omitManagedKeys, parseQueryStates, serializeQueryStates } from '../../src/core/schema'

const schema = {
  currency: defineQueryParam('currency', codecs.string),
  sort: defineQueryParam('filters.sort', codecs.string),
  statuses: defineQueryParam('filters.statuses', codecs.arrayOf(codecs.string)),
}

describe('parseQueryStates', () => {
  it('parses present fields and omits absent ones', () => {
    expect(parseQueryStates(schema, { currency: 'USD', filters: { sort: 'name' } })).toEqual({
      currency: 'USD',
      sort: 'name',
    })
  })

  it('parses nested array fields', () => {
    expect(parseQueryStates(schema, { filters: { statuses: ['active', 'archived'] } })).toEqual({
      statuses: ['active', 'archived'],
    })
  })

  it('returns an empty map for an empty query', () => {
    expect(parseQueryStates(schema, {})).toEqual({})
  })
})

describe('serializeQueryStates', () => {
  it('merges fields into a nested query object', () => {
    expect(serializeQueryStates(schema, { currency: 'USD', sort: 'name', statuses: ['active'] })).toEqual({
      currency: 'USD',
      filters: { sort: 'name', statuses: ['active'] },
    })
  })

  it('skips absent values', () => {
    expect(serializeQueryStates(schema, { currency: 'USD' })).toEqual({ currency: 'USD' })
  })
})

describe('getManagedKeys', () => {
  it('returns every managed path', () => {
    expect(getManagedKeys(schema)).toEqual(['currency', 'filters.sort', 'filters.statuses'])
  })
})

describe('omitManagedKeys', () => {
  it('removes managed keys and preserves unmanaged siblings', () => {
    const query = {
      currency: 'USD',
      filters: { sort: 'name', owner: 'me' },
      page: '2',
    }

    expect(omitManagedKeys(schema, query)).toEqual({
      filters: { owner: 'me' },
      page: '2',
    })
  })

  it('does not mutate the input query', () => {
    const query = { currency: 'USD', filters: { sort: 'name' } }

    omitManagedKeys(schema, query)

    expect(query).toEqual({ currency: 'USD', filters: { sort: 'name' } })
  })

  it('preserves unmanaged siblings, including empty ones', () => {
    const query = { currency: 'USD', q: '', filters: { owner: 'me' } }

    expect(omitManagedKeys(schema, query)).toEqual({ q: '', filters: { owner: 'me' } })
  })

  it('prunes ancestor objects left empty by removal', () => {
    expect(omitManagedKeys(schema, { filters: { sort: 'name' } })).toEqual({})
  })
})

describe('buildQuery', () => {
  it('writes the provided values and drops managed keys absent from them', () => {
    const currentQuery = {
      currency: 'USD',
      filters: { owner: 'me' },
      page: '2',
    }

    expect(buildQuery(schema, currentQuery, { sort: 'name', statuses: ['active'] })).toEqual({
      filters: { owner: 'me', sort: 'name', statuses: ['active'] },
      page: '2',
    })
  })

  it('preserves unmanaged params', () => {
    expect(buildQuery(schema, { page: '2' }, { currency: 'EUR' })).toEqual({
      currency: 'EUR',
      page: '2',
    })
  })

  it('preserves unmanaged params, including empty ones', () => {
    expect(buildQuery(schema, { q: '', page: '2' }, { currency: 'EUR' })).toEqual({
      q: '',
      page: '2',
      currency: 'EUR',
    })
  })
})

describe('dropDefaults', () => {
  const withDefault = {
    page: defineQueryParam('page', codecs.integer.withDefault(1)),
    q: defineQueryParam('q', codecs.string),
  }

  it('drops a value equal to its default', () => {
    expect(dropDefaults(withDefault, { page: 1, q: 'lease' })).toEqual({ q: 'lease' })
  })

  it('keeps a value that differs from its default', () => {
    expect(dropDefaults(withDefault, { page: 2 })).toEqual({ page: 2 })
  })

  it('drops absent fields and keeps fields without a default', () => {
    expect(dropDefaults(withDefault, { page: undefined, q: 'lease' })).toEqual({ q: 'lease' })
  })
})

describe('deeply nested paths', () => {
  const deepSchema = {
    sort: defineQueryParam('a.b.sort', codecs.string),
  }

  it('serializes into a 3-level path', () => {
    expect(serializeQueryStates(deepSchema, { sort: 'name' })).toEqual({ a: { b: { sort: 'name' } } })
  })

  it('parses from a 3-level path', () => {
    expect(parseQueryStates(deepSchema, { a: { b: { sort: 'name' } } })).toEqual({ sort: 'name' })
  })

  it('prunes every empty ancestor on removal', () => {
    expect(omitManagedKeys(deepSchema, { a: { b: { sort: 'name' } } })).toEqual({})
  })

  it('keeps non-empty ancestors when pruning', () => {
    expect(omitManagedKeys(deepSchema, { a: { b: { sort: 'name', x: '1' }, c: '2' } })).toEqual({
      a: { b: { x: '1' }, c: '2' },
    })
  })
})
