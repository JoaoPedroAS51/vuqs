import { describe, expect, it, vi } from 'vitest'
import { toValue } from 'vue'
import { createBrowserHistoryAdapter } from '../../../src/adapters/browser-history'
import { addDebugReporter } from '../../../src/core/diagnostics/bus'
import { makeAdapter, makeBrowser } from '../../helpers/browser-history'

describe('createBrowserHistoryAdapter', () => {
  it('requires a browser at creation time', () => {
    vi.stubGlobal('window', undefined)
    expect(() => createBrowserHistoryAdapter()).toThrow('requires a browser window')
  })

  it('reads encoded values, empty values, dotted objects, and repeated keys', () => {
    makeBrowser('https://example.com/?q=caf%C3%A9+au+lait&empty=&filters.sort=name&tag=a&tag=b&tag=c')
    const adapter = makeAdapter()
    expect(toValue(adapter.query)).toEqual({
      q: 'café au lait',
      empty: '',
      filters: { sort: 'name' },
      tag: ['a', 'b', 'c'],
    })
  })

  it('treats inherited names as values and rejects unsafe paths', () => {
    makeBrowser('https://example.com/?toString=a&toString=b&__proto__.polluted=yes&constructor.prototype.polluted=yes&safe=value')
    const adapter = makeAdapter()
    expect(toValue(adapter.query)).toEqual({ toString: ['a', 'b'], safe: 'value' })
    expect({}).not.toHaveProperty('polluted')
  })

  it('commits synchronously using replace and preserves path, hash, and state', () => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    const state = browser.history.state
    const result = adapter.navigate({ q: 'café au lait', filters: { sort: 'name' }, tag: ['a', 'b'], page: 0, active: false }, {})

    expect(result).toBeUndefined()
    expect(browser.history.replaceState).toHaveBeenCalledOnce()
    expect(browser.history.pushState).not.toHaveBeenCalled()
    expect(browser.location.pathname).toBe('/products')
    expect(browser.location.hash).toBe('#results')
    expect(browser.history.state).toBe(state)
    expect(browser.location.searchParams.getAll('tag')).toEqual(['a', 'b'])
    expect(browser.location.searchParams.get('filters.sort')).toBe('name')
    expect(toValue(adapter.query)).toEqual({ q: 'café au lait', filters: { sort: 'name' }, tag: ['a', 'b'], page: '0', active: 'false' })
    expect(browser.scrollTo).not.toHaveBeenCalled()
  })

  it('omits nullish and empty containers while preserving empty strings', () => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    adapter.navigate({ absent: undefined, cleared: null, emptyArray: [], emptyObject: {}, filters: { missing: null }, empty: '', tag: ['a', null, undefined] }, {})
    expect(browser.location.search).toBe('?empty=&tag=a')
    expect(toValue(adapter.query)).toEqual({ empty: '', tag: 'a' })
    adapter.navigate({}, {})
    expect(browser.location.search).toBe('')
    expect(toValue(adapter.query)).toEqual({})
  })

  it.each([{ tag: [{ name: 'a' }] }, { tag: [['a']] }])('rejects unsupported arrays before changing history: %j', (query) => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    expect(() => adapter.navigate(query, {})).toThrow('arrays must contain scalar values')
    expect(browser.history.replaceState).not.toHaveBeenCalled()
    expect(toValue(adapter.query)).toEqual({ utm: 'campaign' })
  })

  it('uses push and synchronizes back and forward', () => {
    const browser = makeBrowser('https://example.com/?q=initial')
    const adapter = makeAdapter()
    adapter.navigate({ q: 'next' }, { history: 'push' })
    expect(browser.history.pushState).toHaveBeenCalledOnce()
    expect(toValue(adapter.query)).toEqual({ q: 'next' })
    browser.history.back()
    expect(toValue(adapter.query)).toEqual({ q: 'initial' })
    browser.history.forward()
    expect(toValue(adapter.query)).toEqual({ q: 'next' })
  })

  it('refreshes external history writes without patching the native methods', () => {
    const browser = makeBrowser()
    const push = browser.history.pushState
    const replace = browser.history.replaceState
    const adapter = makeAdapter()
    browser.history.pushState({}, '', '/other?q=external')
    expect(toValue(adapter.query)).toEqual({ utm: 'campaign' })
    adapter.refresh()
    expect(toValue(adapter.query)).toEqual({ q: 'external' })
    browser.history.replaceState({}, '', '/other?q=replaced')
    adapter.refresh()
    expect(toValue(adapter.query)).toEqual({ q: 'replaced' })
    expect(browser.history.pushState).toBe(push)
    expect(browser.history.replaceState).toBe(replace)
  })

  it('scrolls only when explicitly requested', () => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    adapter.navigate({ q: 'a' }, { scroll: false })
    expect(browser.scrollTo).not.toHaveBeenCalled()
    adapter.navigate({ q: 'b' }, { scroll: true })
    expect(browser.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0)
  })

  it('propagates history errors without committing a query snapshot', () => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    const initial = toValue(adapter.query)
    browser.history.replaceState.mockImplementationOnce(() => {
      throw new Error('history unavailable')
    })
    expect(() => adapter.navigate({ q: 'failed' }, {})).toThrow('history unavailable')
    expect(toValue(adapter.query)).toBe(initial)
    expect(browser.location.search).toBe('?utm=campaign')
  })

  it('emits direct navigation diagnostics', () => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    const codes: string[] = []
    const stop = addDebugReporter(event => codes.push(event.code))
    try {
      adapter.navigate({ q: 'a' }, {})
      browser.history.pushState.mockImplementationOnce(() => {
        throw new Error('failed')
      })
      expect(() => adapter.navigate({ q: 'b' }, { history: 'push' })).toThrow('failed')
      expect(codes).toEqual(['adapter:navigate', 'adapter:navigate', 'adapter:error'])
    }
    finally {
      stop()
    }
  })

  it.each(['push', 'replace'] as const)('rejects %s navigation when a debug reporter disposes the adapter', (history) => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    const initialQuery = toValue(adapter.query)
    const initialUrl = browser.location.href
    const stop = addDebugReporter((event) => {
      if (event.code === 'adapter:navigate') {
        adapter.dispose()
      }
    })

    try {
      expect(() => adapter.navigate({ q: 'after-disposal' }, { history, scroll: true })).toThrow('has been disposed')
      expect(browser.history.pushState).not.toHaveBeenCalled()
      expect(browser.history.replaceState).not.toHaveBeenCalled()
      expect(browser.scrollTo).not.toHaveBeenCalled()
      expect(browser.location.href).toBe(initialUrl)
      expect(toValue(adapter.query)).toBe(initialQuery)
    }
    finally {
      stop()
    }
  })

  it('disposes once, removes its listener, and rejects subsequent operations', () => {
    const browser = makeBrowser()
    const adapter = makeAdapter()
    adapter.dispose()
    adapter.dispose()
    browser.history.pushState({}, '', '/?q=external')
    browser.history.back()
    expect(browser.removeEventListener).toHaveBeenCalledExactlyOnceWith('popstate', adapter.refresh)
    expect(toValue(adapter.query)).toEqual({ utm: 'campaign' })
    expect(() => adapter.refresh()).toThrow('has been disposed')
    expect(() => adapter.navigate({ q: 'a' }, {})).toThrow('has been disposed')
  })
})
