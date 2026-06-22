import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
import { createSerializer } from '../../src/core/serializer'

const schema = {
  q: defineQueryState('q', codecs.string),
  sort: defineQueryState('filters.sort', codecs.string),
  page: defineQueryState('page', codecs.integer.withDefault(1)),
}

describe('createSerializer', () => {
  it('serializes values into a fresh query', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ q: 'lease' })).toEqual({ q: 'lease' })
    expect(serialize({ q: 'lease', sort: 'name' })).toEqual({ q: 'lease', filters: { sort: 'name' } })
  })

  it('merges over a base, keeping untouched managed fields', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ q: 'old', filters: { sort: 'name' } }, { q: 'new' })).toEqual({
      q: 'new',
      filters: { sort: 'name' },
    })
  })

  it('preserves unmanaged params on the base', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ keep: 'me' }, { q: 'lease' })).toEqual({ keep: 'me', q: 'lease' })
  })

  it('clears a field with null', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ q: 'old', filters: { sort: 'name' } }, { sort: null })).toEqual({ q: 'old' })
  })

  it('skips a field set to undefined', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ q: 'old' }, { q: undefined })).toEqual({ q: 'old' })
  })

  it('drops a value equal to its default', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ page: 5 }, { page: 1 })).toEqual({})
    expect(serialize({ page: 2 })).toEqual({ page: '2' })
  })

  it('keeps a default value when clearOnDefault is false', () => {
    const serialize = createSerializer(schema, { clearOnDefault: false })

    expect(serialize({ page: 1 })).toEqual({ page: '1' })
  })

  it('does not inject a default for a field absent from the base (clearOnDefault false)', () => {
    const serialize = createSerializer(schema, { clearOnDefault: false })

    expect(serialize({ q: 'old' }, {})).toEqual({ q: 'old' })
  })

  it('preserves an untouched base field even when it equals its default', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ page: '1', q: 'x' }, { q: 'y' })).toEqual({ page: '1', q: 'y' })
  })

  it('renders a string with the stringify option', () => {
    const serialize = createSerializer(schema, { stringify: query => JSON.stringify(query) })

    expect(serialize({ q: 'lease' })).toBe('{"q":"lease"}')
  })

  it('accepts a string base with the parse option', () => {
    const serialize = createSerializer(schema, { parse: search => JSON.parse(search) })

    expect(serialize('{"q":"old"}', { sort: 'name' })).toEqual({ q: 'old', filters: { sort: 'name' } })
  })

  it('throws on a string base without the parse option', () => {
    const serialize = createSerializer(schema)

    expect(() => (serialize as (base: unknown, values: unknown) => unknown)('?q=x', {})).toThrowError(
      /string base requires the `parse` option/,
    )
  })
})
