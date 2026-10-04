import type { Mock } from 'vitest'
import type { BrowserHistoryAdapter } from '../../src/adapters/browser-history'
import { onTestFinished, vi } from 'vitest'
import { createBrowserHistoryAdapter } from '../../src/adapters/browser-history'

interface HistoryEntry {
  url: URL
  state: unknown
}

interface TestBrowser {
  readonly location: URL
  history: {
    readonly state: unknown
    pushState: Mock<(state: unknown, unused: unknown, url: string) => void>
    replaceState: Mock<(state: unknown, unused: unknown, url: string) => void>
    back: () => void
    forward: () => void
  }
  scrollTo: Mock
  addEventListener: Mock<EventTarget['addEventListener']>
  removeEventListener: Mock<EventTarget['removeEventListener']>
}

export function makeBrowser(initial = 'https://example.com/products?utm=campaign#results'): TestBrowser {
  const events = new EventTarget()
  const entries: HistoryEntry[] = [{ url: new URL(initial), state: { existing: 'state' } }]
  let index = 0
  const current = (): HistoryEntry => entries[index]
  const browser = {
    get location() { return current().url },
    history: {
      get state() { return current().state },
      pushState: vi.fn((state, _unused, url: string) => {
        entries.splice(index + 1, entries.length, { url: new URL(url, current().url), state })
        index++
      }),
      replaceState: vi.fn((state, _unused, url: string) => {
        entries[index] = { url: new URL(url, current().url), state }
      }),
      back() {
        index--
        events.dispatchEvent(new Event('popstate'))
      },
      forward() {
        index++
        events.dispatchEvent(new Event('popstate'))
      },
    },
    scrollTo: vi.fn(),
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
  }
  vi.stubGlobal('window', browser)
  return browser
}

export function makeAdapter(options?: Parameters<typeof createBrowserHistoryAdapter>[0]): BrowserHistoryAdapter {
  const adapter = createBrowserHistoryAdapter(options)
  onTestFinished(() => adapter.dispose())
  return adapter
}
