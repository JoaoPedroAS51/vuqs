import { afterEach, describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { addDebugReporter } from '../../src/core/debug/bus'
import { queryParam } from '../../src/core/query-param'
import { createSerializer } from '../../src/core/serializer'

const schema = {
  q: queryParam('q', codecs.string),
  sort: queryParam('filters.sort', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('createSerializer', () => {
  const disposers: Array<() => void> = []
  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()?.()
    }
  })

  it('emits serializer:build on the bus when debug is armed', () => {
    const codes: string[] = []
    disposers.push(addDebugReporter(event => codes.push(event.code)))

    createSerializer(schema)({ q: 'phone', page: 1 })

    expect(codes).toContain('serializer:build')
    expect(codes).toContain('serializer:clear-on-default')
  })

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

  it('clears an explicit undefined param and prunes its empty ancestors', () => {
    const serialize = createSerializer(schema)

    expect(serialize({ q: 'old', filters: { sort: 'name' } }, { sort: undefined })).toEqual({ q: 'old' })
  })

  it('preserves omitted params and unmanaged siblings when clearing', () => {
    const serialize = createSerializer(schema)

    const base = { q: 'old', filters: { sort: 'name', keep: '' }, other: 'keep' }

    expect(serialize(base, { sort: undefined })).toEqual({ q: 'old', filters: { keep: '' }, other: 'keep' })
    expect(base).toEqual({ q: 'old', filters: { sort: 'name', keep: '' }, other: 'keep' })
  })

  it('serializes null as a JSON value and clears it with undefined', () => {
    const serialize = createSerializer({ payload: codecs.json<{ id: number } | null>() })

    expect(serialize({ payload: null })).toEqual({ payload: 'null' })
    expect(serialize({ payload: '{"id":1}', keep: 'me' }, { payload: null })).toEqual({ payload: 'null', keep: 'me' })
    expect(serialize({ payload: 'null', keep: 'me' }, { payload: undefined })).toEqual({ keep: 'me' })
  })

  it('clears a defaulted param even when default elision is disabled', () => {
    const serialize = createSerializer({
      payload: codecs.json<{ id: number } | null>().withDefault(null),
    }, { clearOnDefault: false })

    expect(serialize({ payload: null })).toEqual({ payload: 'null' })
    expect(serialize({ payload: 'null' }, { payload: undefined })).toEqual({})
  })

  it('drops null only when it equals the codec default', () => {
    const serialize = createSerializer({
      payload: codecs.json<{ id: number } | null>().withDefault(null),
    })

    expect(serialize({ payload: null })).toEqual({})
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

  it('serializer options override keepOnDefault', () => {
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
