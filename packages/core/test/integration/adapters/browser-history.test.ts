import type { BrowserHistoryAdapter } from '../../../src/adapters/browser-history'
import type { ParsedQuery } from '../../../src/core/query/types'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, createRenderer, defineComponent, effectScope, h, toValue } from 'vue'
import { provideBrowserHistoryAdapter } from '../../../src/adapters/browser-history'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { addDebugReporter } from '../../../src/core/diagnostics/bus'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { makeAdapter, makeBrowser } from '../../helpers/browser-history'

describe('browser history query runtime', () => {
  it('coalesces bindings, applies defaults, and preserves unmanaged params', async () => {
    const browser = makeBrowser('https://example.com/products?filters.sort=name&utm=campaign#results')
    const adapter = makeAdapter({ defaultOptions: { history: 'push', scroll: true } })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    try {
      const states = scope.run(() => app.runWithContext(() => useQueryStates({
        sort: queryParam('filters.sort'),
        page: codecs.integer.withDefault(1),
      })))!
      const q = scope.run(() => app.runWithContext(() => useQueryState('q', codecs.string)))!
      states.patch({ sort: 'price', page: 2 })
      q.set('sale')
      expect(q.value).toBe('sale')
      await Promise.resolve()
      expect(browser.history.pushState).toHaveBeenCalledOnce()
      expect(browser.scrollTo).toHaveBeenCalledOnce()
      expect(toValue(adapter.query)).toEqual({ filters: { sort: 'price' }, utm: 'campaign', page: '2', q: 'sale' })

      states.patch({ page: 1 }, { history: 'replace', scroll: false })
      await Promise.resolve()
      expect(browser.history.replaceState).toHaveBeenCalledOnce()
      expect(browser.location.searchParams.has('page')).toBe(false)
      expect(states.values.page).toBe(1)
      browser.history.back()
      expect(states.values.sort).toBe('name')
      expect(q.value).toBeUndefined()
    }
    finally {
      scope.stop()
    }
  })

  it('rolls back a failed queued write and accepts a later write', async () => {
    const browser = makeBrowser('https://example.com/?q=initial')
    const adapter = makeAdapter()
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    const stop = addDebugReporter(() => {})
    try {
      const q = scope.run(() => app.runWithContext(() => useQueryState('q', codecs.string)))!
      browser.history.replaceState.mockImplementationOnce(() => {
        throw new Error('failed')
      })
      q.set('failed')
      await Promise.resolve()
      expect(q.value).toBe('initial')
      q.set('success')
      await Promise.resolve()
      expect(q.value).toBe('success')
      expect(browser.location.search).toBe('?q=success')
    }
    finally {
      stop()
      scope.stop()
    }
  })

  it('cancels throttled pending writes on disposal', async () => {
    vi.useFakeTimers()
    const browser = makeBrowser('https://example.com/?q=initial')
    const adapter = makeAdapter({ defaultOptions: { throttleMs: 100 } })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    try {
      const q = scope.run(() => app.runWithContext(() => useQueryState('q', codecs.string)))!
      q.set('pending')
      expect(q.value).toBe('pending')
      adapter.dispose()
      await vi.runAllTimersAsync()
      expect(browser.history.replaceState).not.toHaveBeenCalled()
      expect(q.value).toBe('initial')
    }
    finally {
      scope.stop()
    }
  })
})

describe('provideBrowserHistoryAdapter', () => {
  it('provides to descendants and cleans up when the component unmounts', async () => {
    const browser = makeBrowser('https://example.com/?q=initial')
    const renderer = createRenderer<Record<string, never>, Record<string, never>>({
      insert() {},
      remove() {},
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText() {},
      setElementText() {},
      parentNode: () => null,
      nextSibling: () => null,
      patchProp() {},
    })
    let adapter: BrowserHistoryAdapter | undefined
    let read: (() => ParsedQuery) | undefined
    const Child = defineComponent({
      setup() {
        const states = useQueryStates({ q: codecs.string })
        read = () => ({ q: states.values.q })
        return () => h('div')
      },
    })
    const Parent = defineComponent({
      setup() {
        const provided = provideBrowserHistoryAdapter()
        adapter = provided
        onTestFinished(() => provided.dispose())
        return () => h(Child)
      },
    })
    const app = renderer.createApp(Parent)
    app.mount({})
    expect(read!()).toEqual({ q: 'initial' })
    adapter!.navigate({ q: 'next' }, {})
    expect(read!()).toEqual({ q: 'next' })
    app.unmount()
    expect(browser.removeEventListener).toHaveBeenCalledOnce()
    expect(() => adapter!.refresh()).toThrow('has been disposed')
  })
})
