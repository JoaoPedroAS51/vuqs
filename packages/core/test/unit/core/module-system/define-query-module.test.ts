import { describe, expect, it, vi } from 'vitest'
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
      states: (_core, options: unknown) => ({ api: { received: options } }),
      state: (_core, _key, options: unknown) => ({ api: { received: options } }),
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
      states: () => ({ api: { grouped: true } }),
      state: (_core, _key, options: { label: string }) => ({ api: { label: options.label } }),
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
      state: (_core, _key, options: { label: string }) => ({ api: { label: options.label } }),
    })

    const single = build(() => useQueryState(param).use(module(param, { label: 'targeted' })))

    expect(single.label).toBe('targeted')
  })

  // All call forms share one dispatcher. A JavaScript caller can bypass the
  // overloads, so unsupported combinations must reject composition consistently.
  it('rejects useQueryState when a grouped-only module is targeted', () => {
    const { build } = setup()
    const groupedOnly = defineQueryModule({
      states: () => ({ api: { grouped: true } }),
    })

    const targeted = (groupedOnly as unknown as (key: string, options: object) => object)('q', {})

    expect(() =>
      build(() => useQueryState('q', codecs.string).use(targeted as never)),
    ).toThrow(/does not support useQueryState/)
  })

  it('rejects useQueryState when a single-only module receives a schema', () => {
    const { build } = setup()
    const singleOnly = defineQueryModule({
      state: (_core, key) => ({ api: { boundKey: key } }),
    })

    const result = (singleOnly as unknown as (schema: object, options: object) => object)({ q: 'schema' }, {})

    expect(typeof result).toBe('object')
    expect(() =>
      build(() => useQueryState('q', codecs.string).use(result as never)),
    ).toThrow(/does not support useQueryState/)
  })
})

describe('defineQueryModule configuration', () => {
  it('defers setup until installation and runs only the selected facade', () => {
    const { build } = setup()
    const states = vi.fn((_core: unknown, _options: { label: string }) => ({ api: { grouped: true } }))
    const state = vi.fn((_core: unknown, _key: unknown, _options: { label: string }) => ({ api: { single: true } }))
    const module = defineQueryModule({ states, state })

    const configured = module({ label: 'x' })

    expect(states).not.toHaveBeenCalled()
    expect(state).not.toHaveBeenCalled()

    build(() => useQueryStates({ q: codecs.string }).use(configured))
    expect(states).toHaveBeenCalledOnce()
    expect(state).not.toHaveBeenCalled()

    build(() => useQueryState('q').use(module({ label: 'y' })))
    expect(state).toHaveBeenCalledOnce()
  })

  it('exposes the actual setup callbacks as the definition', () => {
    const states = () => ({ api: {} })
    const state = () => ({ api: {} })
    const module = defineQueryModule({ states, state })

    expect(module.definition.states).toBe(states)
    expect(module.definition.state).toBe(state)
  })

  it('supports a module with one facade and an API-only result', () => {
    const { build } = setup()
    const single = defineQueryModule({ state: (_core, key) => ({ api: { boundKey: key } }) })
    const grouped = defineQueryModule({ states: () => ({ api: { grouped: true } }) })

    expect(build(() => useQueryState('q').use(single())).boundKey).toBe('value')
    expect(build(() => useQueryStates({ q: codecs.string }).use(grouped())).grouped).toBe(true)
    expect(typeof single()).toBe('object')
  })
})
