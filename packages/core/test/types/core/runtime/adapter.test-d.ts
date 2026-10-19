import type { NavigateOptions, QueryAdapter, QueryAdapterDefaultOptions, QueryStateNavigate, UseQueryStatesOptions } from '../../../../src/index'
import { describe, expectTypeOf, it } from 'vitest'

describe('query adapter navigation', () => {
  it('supports synchronous and asynchronous navigation', () => {
    expectTypeOf<QueryStateNavigate>().returns.toEqualTypeOf<void | Promise<void>>()
    expectTypeOf<QueryAdapter['navigate']>().toEqualTypeOf<QueryStateNavigate>()
    expectTypeOf<() => void>().toExtend<QueryStateNavigate>()
    expectTypeOf<() => Promise<void>>().toExtend<QueryStateNavigate>()
  })

  it('rejects unrelated navigation results', () => {
    expectTypeOf<() => boolean>().not.toExtend<QueryStateNavigate>()
    expectTypeOf<() => Promise<boolean>>().not.toExtend<QueryStateNavigate>()
  })
})

describe('scroll option', () => {
  it('accepts a boolean or ScrollToOptions per call, per composable and in adapter defaults', () => {
    expectTypeOf<NavigateOptions['scroll']>().toEqualTypeOf<boolean | ScrollToOptions | undefined>()
    expectTypeOf<UseQueryStatesOptions['scroll']>().toEqualTypeOf<boolean | ScrollToOptions | undefined>()
    expectTypeOf<QueryAdapterDefaultOptions['scroll']>().toEqualTypeOf<boolean | ScrollToOptions | undefined>()
    expectTypeOf({ top: 400, behavior: 'smooth' as const }).toExtend<NavigateOptions['scroll']>()
  })

  it('rejects strings and element targets', () => {
    expectTypeOf<'top'>().not.toExtend<NavigateOptions['scroll']>()

    // @ts-expect-error `el` is not a `ScrollToOptions` member
    const elementTarget: NavigateOptions = { scroll: { el: '#results' } }
    expectTypeOf(elementTarget).toEqualTypeOf<NavigateOptions>()
  })
})
