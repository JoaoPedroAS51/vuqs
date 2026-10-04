import type { ParsedQuery, ParsedQueryValue } from '../core/query/types'
import type { QueryAdapter, QueryAdapterDefaultOptions } from '../core/runtime/adapter'
import { onScopeDispose, shallowRef } from 'vue'
import { provideQueryAdapter } from '../core/bindings/adapter-provider'
import { debugChannelForAdapter, emitDebug, emitWarn, isDebugArmed } from '../core/diagnostics/bus'
import { setPath } from '../core/query/path'
import { resetQueryRuntime } from '../core/runtime/adapter-runtime'
import { isManagedNavigation } from '../core/runtime/managed-navigation'

/** Options for the browser History API adapter factories. */
export interface BrowserHistoryAdapterOptions {
  /** Default navigation and write options carried by the adapter. */
  defaultOptions?: QueryAdapterDefaultOptions
}

/** A query adapter backed by the current browser URL. */
export interface BrowserHistoryAdapter extends QueryAdapter {
  /** Reads the current URL after external calls to `pushState` or `replaceState`. */
  refresh: () => void
  /** Removes the history listener and cancels pending writes. Safe to call repeatedly. */
  dispose: () => void
}

function parseSearch(search: string): ParsedQuery {
  const flat: Record<string, string | string[]> = Object.create(null)

  for (const [key, value] of new URLSearchParams(search)) {
    const existing = flat[key]

    if (existing === undefined) {
      flat[key] = value
    }
    else if (Array.isArray(existing)) {
      existing.push(value)
    }
    else {
      flat[key] = [existing, value]
    }
  }

  const query: ParsedQuery = {}

  for (const [key, value] of Object.entries(flat)) {
    setPath(query, key, value)
  }

  return query
}

function stringifyQuery(query: ParsedQuery): string {
  const params = new URLSearchParams()

  function append(path: string, value: ParsedQueryValue): void {
    if (value === null || value === undefined) {
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && typeof item === 'object') {
          throw new TypeError(`[vuqs] Browser history arrays must contain scalar values: ${path}`)
        }
        append(path, item)
      }
    }
    else if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        append(`${path}.${key}`, child)
      }
    }
    else {
      params.append(path, String(value))
    }
  }

  for (const [key, value] of Object.entries(query)) {
    append(key, value)
  }

  return params.toString()
}

/**
 * Creates a query adapter backed by the browser History API.
 *
 * @param options - Default navigation and write options.
 * @returns An adapter to pass to `installQueryAdapter` or `provideQueryAdapter`.
 * @see https://vuqs.dev/guide/getting-started/adapters
 */
export function createBrowserHistoryAdapter(options: BrowserHistoryAdapterOptions = {}): BrowserHistoryAdapter {
  if (typeof window === 'undefined') {
    throw new Error('[vuqs] createBrowserHistoryAdapter requires a browser window')
  }

  const browser = window
  const query = shallowRef(parseSearch(browser.location.search))
  let disposed = false

  function assertActive(): void {
    if (disposed) {
      throw new Error('[vuqs] Browser history adapter has been disposed')
    }
  }

  function refresh(): void {
    assertActive()
    query.value = parseSearch(browser.location.search)
  }

  const adapter: BrowserHistoryAdapter = {
    debugName: 'browser-history',
    query: () => query.value,
    navigate(next, navigateOptions) {
      assertActive()
      const mode = navigateOptions.history === 'push' ? 'push' : 'replace'
      const channel = debugChannelForAdapter(adapter)
      const managed = isManagedNavigation(adapter)

      if (!managed && isDebugArmed(channel)) {
        emitDebug(channel, 'adapter:navigate', { adapter: 'browser-history', mode, query: next })
      }

      try {
        const url = new URL(browser.location.href)
        url.search = stringifyQuery(next)

        assertActive()

        if (mode === 'push') {
          browser.history.pushState(browser.history.state, '', url.href)
        }
        else {
          browser.history.replaceState(browser.history.state, '', url.href)
        }

        refresh()

        if (navigateOptions.scroll === true) {
          browser.scrollTo(0, 0)
        }
      }
      catch (error) {
        if (!managed) {
          emitWarn(channel, 'adapter:error', { adapter: 'browser-history', error })
        }
        throw error
      }
    },
    defaultOptions: options.defaultOptions,
    refresh,
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      browser.removeEventListener('popstate', refresh)
      resetQueryRuntime(adapter)
    },
  }

  browser.addEventListener('popstate', refresh)

  return adapter
}

/**
 * Creates a browser History API adapter and provides it to descendant components.
 *
 * @param options - Default navigation and write options.
 * @returns The created adapter, already provided to descendants.
 */
export function provideBrowserHistoryAdapter(options?: BrowserHistoryAdapterOptions): BrowserHistoryAdapter {
  const adapter = createBrowserHistoryAdapter(options)

  provideQueryAdapter(adapter)
  onScopeDispose(adapter.dispose)

  return adapter
}
