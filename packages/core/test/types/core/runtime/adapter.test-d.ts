import type { QueryAdapter, QueryStateNavigate } from '../../../../src/index'
import { describe, expectTypeOf, it } from 'vitest'

describe('query adapter navigation', () => {
  it('supports synchronous and asynchronous navigation', () => {
    expectTypeOf<QueryStateNavigate>().returns.toEqualTypeOf<void | Promise<void>>()
    expectTypeOf<QueryAdapter['navigate']>().toEqualTypeOf<QueryStateNavigate>()
    expectTypeOf<() => void>().toMatchTypeOf<QueryStateNavigate>()
    expectTypeOf<() => Promise<void>>().toMatchTypeOf<QueryStateNavigate>()
  })

  it('rejects unrelated navigation results', () => {
    expectTypeOf<() => boolean>().not.toMatchTypeOf<QueryStateNavigate>()
    expectTypeOf<() => Promise<boolean>>().not.toMatchTypeOf<QueryStateNavigate>()
  })
})
