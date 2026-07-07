import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codec'
import { defineQueryModule } from '../../src/core/module'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'
import { withTestQuery as setup } from '../helpers/adapter'

describe('use() collision guard', () => {
  const schema = { q: queryParam('q', codecs.string) }

  it('throws when two modules contribute the same key', () => {
    const { build } = setup()

    expect(() =>
      build(() =>
        useQueryStates(schema)
          .use(() => ({ shared: 1 }))
          .use(() => ({ shared: 2 })),
      ),
    ).toThrow(/module key "shared" is already provided/)
  })

  it('throws when a module overwrites a built-in key', () => {
    const { build } = setup()

    expect(() =>
      build(() => useQueryStates(schema).use(() => ({ clear: () => {} }))),
    ).toThrow(/module key "clear" is already provided/)
  })

  it('keeps a single-only module non-callable, matching its non-grouped type', () => {
    const { build } = setup()
    const singleOnly = defineQueryModule({
      queryState: (_core, key) => ({ boundKey: key }),
    })

    // The single facade composes it; the type rejects it on useQueryStates,
    // and at runtime it is not a callable grouped module.
    const single = build(() => useQueryState('q').use(singleOnly()))

    expect(single.boundKey).toBe('value')
    expect(typeof singleOnly()).toBe('object')
  })
})

describe('defineQueryModule targeted call form', () => {
  it('accepts a key as the first argument, stripping the grouped projection', () => {
    const { build } = setup()
    const module = defineQueryModule({
      queryStates: () => ({ grouped: true }),
      queryState: (_core, _key, options: { label: string }) => ({ label: options.label }),
    })

    const targeted = module('q', { label: 'targeted' })

    expect(typeof targeted).toBe('object')

    const single = build(() => useQueryState('q', codecs.string).use(targeted))

    expect(single.label).toBe('targeted')
  })

  it('accepts a defined param as the first argument', () => {
    const { build } = setup()
    const param = queryParam('q', codecs.string)
    const module = defineQueryModule({
      queryState: (_core, _key, options: { label: string }) => ({ label: options.label }),
    })

    const single = build(() => useQueryState(param).use(module(param, { label: 'targeted' })))

    expect(single.label).toBe('targeted')
  })

  it('throws when a module returns no API object', () => {
    const { build } = setup()
    const module = defineQueryModule({
      queryStates: () => undefined as unknown as object,
    })

    expect(() =>
      build(() => useQueryStates({ q: queryParam('q', codecs.string) }).use(module())),
    ).toThrow('[vuqs] module did not return an API object')
  })

  // The dispatcher backing every defineQueryModule call form is shared across the
  // both/grouped-only/single-only overloads, so a JS caller who bypasses the type
  // overloads (no queryState, but targeted; or no queryStates, but schema-first)
  // must still degrade to a well-shaped, safely inert module rather than crash.
  it('degrades safely when a grouped-only module is targeted', () => {
    const { build } = setup()
    const groupedOnly = defineQueryModule({
      queryStates: () => ({ grouped: true }),
    })

    const targeted = (groupedOnly as unknown as (key: string, options: object) => object)('q', {})

    expect(() =>
      build(() => useQueryState('q', codecs.string).use(targeted as never)),
    ).toThrow(/does not support useQueryState/)
  })

  it('degrades safely when a single-only module is called with a schema-shaped first argument', () => {
    const { build } = setup()
    const singleOnly = defineQueryModule({
      queryState: (_core, key) => ({ boundKey: key }),
    })

    const result = (singleOnly as unknown as (schema: object, options: object) => object)({ q: 'schema' }, {})

    expect(typeof result).toBe('object')
    expect(() =>
      build(() => useQueryState('q', codecs.string).use(result as never)),
    ).toThrow(/does not support useQueryState/)
  })
})
