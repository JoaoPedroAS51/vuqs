import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { createSerializer } from '../../src/core/serializer'

const schema = {
  q: queryParam('q', codecs.string),
  sort: queryParam('filters.sort', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('createSerializer', () => {
  it('serializes values into a fresh query', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ q: 'phone' })).toEqual({ q: 'phone' })
    expect(serialize({ q: 'phone', sort: 'name' })).toEqual({ q: 'phone', filters: { sort: 'name' } })
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

    expect(serialize({ keep: 'me' }, { q: 'phone' })).toEqual({ keep: 'me', q: 'phone' })
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

  it('accepts codecs directly using the schema key as the query path', () => {
    const serialize = createSerializer({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    })

    expect(serialize({ q: 'phone', page: 2 })).toEqual({ q: 'phone', page: '2' })
  })

  it('keeps a default value when keepOnDefault is set on the param', () => {
    const serialize = createSerializer({
      page: queryParam('page', codecs.integer).withDefault(1).keepOnDefault(),
    })

    expect(serialize({ page: 1 })).toEqual({ page: '1' })
  })

  it('lets serializer options override keepOnDefault', () => {
    const serialize = createSerializer({
      page: queryParam('page', codecs.integer).withDefault(1).keepOnDefault(),
    }, { clearOnDefault: true })

    expect(serialize({ page: 1 })).toEqual({})
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

    expect(serialize({ q: 'phone' })).toBe('{"q":"phone"}')
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
