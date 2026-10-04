import type { BrowserHistoryAdapter, BrowserHistoryAdapterOptions } from '../../../src/adapters/browser-history'
import type { QueryAdapter } from '../../../src/index'
import { describe, expectTypeOf, it } from 'vitest'
import { createBrowserHistoryAdapter, provideBrowserHistoryAdapter } from '../../../src/adapters/browser-history'

describe('browser history adapter', () => {
  it('exposes the adapter contract and lifecycle operations', () => {
    expectTypeOf<BrowserHistoryAdapter>().toMatchTypeOf<QueryAdapter>()
    expectTypeOf<BrowserHistoryAdapter['refresh']>().toEqualTypeOf<() => void>()
    expectTypeOf<BrowserHistoryAdapter['dispose']>().toEqualTypeOf<() => void>()
    expectTypeOf(createBrowserHistoryAdapter).returns.toEqualTypeOf<BrowserHistoryAdapter>()
    expectTypeOf(provideBrowserHistoryAdapter).returns.toEqualTypeOf<BrowserHistoryAdapter>()
    expectTypeOf(createBrowserHistoryAdapter).parameter(0).toEqualTypeOf<BrowserHistoryAdapterOptions | undefined>()
  })
})
