import type { QueryAdapter, QueryStateNavigate } from '../../../../src/index'
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
