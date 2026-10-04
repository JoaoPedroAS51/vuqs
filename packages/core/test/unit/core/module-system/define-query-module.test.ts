import { describe, expect, it } from 'vitest'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../helpers/adapter'

describe('defineQueryModule targeted call form', () => {
  it('uses an array of paths to distinguish a target from module options', () => {
    const { build } = setup()
    const factory = defineQueryModule({
      queryStates: (_core, options: unknown) => ({ received: options }),
      queryState: (_core, _key, options: unknown) => ({ received: options }),
    })
    const target = factory({ paths: ['q'] })
    const options = { paths: 'q' }
    const adaptive = factory(options)

    expect(typeof target).toBe('object')
    expect(build(() => useQueryState('q').use(target)).received).toBeUndefined()
    expect(typeof adaptive).toBe('function')
    expect(build(() => useQueryStates({ q: codecs.string }).use(factory(options))).received).toBe(options)
  })

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

  // All call forms share one dispatcher. A JavaScript caller can bypass the
  // overloads, so unsupported combinations must reject composition consistently.
  it('rejects useQueryState when a grouped-only module is targeted', () => {
    const { build } = setup()
    const groupedOnly = defineQueryModule({
      queryStates: () => ({ grouped: true }),
    })

    const targeted = (groupedOnly as unknown as (key: string, options: object) => object)('q', {})

    expect(() =>
      build(() => useQueryState('q', codecs.string).use(targeted as never)),
    ).toThrow(/does not support useQueryState/)
  })

  it('rejects useQueryState when a single-only module receives a schema', () => {
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

describe('use() collision guard', () => {
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
