import type { ShallowRef } from 'vue'
import type { BrowserHistoryAdapter, BrowserHistoryAdapterOptions } from '../../src/adapters/browser-history'
import type { TestingAdapter } from '../../src/adapters/testing'
import type { ParsedQuery, QueryAdapter, QueryStateNavigate } from '../../src/index'
import { describe, expectTypeOf, it } from 'vitest'
import { createBrowserHistoryAdapter, provideBrowserHistoryAdapter } from '../../src/adapters/browser-history'

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

describe('testing adapter query', () => {
  it('exposes a shallow query ref', () => {
    expectTypeOf<TestingAdapter['query']>().toEqualTypeOf<ShallowRef<ParsedQuery>>()
  })
})
