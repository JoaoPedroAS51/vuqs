import { describe, expectTypeOf, it } from 'vitest'
import { codecs, defineQueryState } from 'vuqs'
import { createQueryStore } from '../../src/create-query-store'

describe('createQueryStore inference', () => {
  it('types the three states and the writers from the schema', () => {
    const store = createQueryStore({
      schema: {
        currency: defineQueryState('currency', codecs.string),
        page: defineQueryState('page', codecs.integer),
      },
      query: () => ({}),
      navigate: () => {},
    })

    expectTypeOf(store.selected).toEqualTypeOf<Readonly<{ currency?: string, page?: number }>>()
    expectTypeOf(store.effective).toEqualTypeOf<Readonly<{ currency?: string, page?: number }>>()
    expectTypeOf(store.setValue).parameter(0).toEqualTypeOf<'currency' | 'page'>()
  })
})
