import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createNuxtMinimalRouterAdapter } from '../../src/runtime/adapters/nuxt-minimal'

type MinimalRouter = Parameters<typeof createNuxtMinimalRouterAdapter>[0]['router']

function createRouter() {
  const currentRoute = { value: { path: '/catalog', hash: '#section', query: { q: 'initial' } } }
  return { currentRoute, replace: vi.fn(), push: vi.fn() }
}

describe('nuxt minimal router adapter', () => {
  it('reads the current query through a getter', () => {
    const router = createRouter()
    const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })

    const readQuery = adapter.query as () => unknown
    expect(readQuery()).toEqual({ q: 'initial' })
    router.currentRoute.value.query = { q: 'changed' }
    expect(readQuery()).toEqual({ q: 'changed' })
  })

  it.each(['replace', 'push'] as const)('uses %s and preserves the current path and hash', async (history) => {
    const router = createRouter()
    const defaultOptions = { history: 'push' as const, throttleMs: 50 }
    const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter, defaultOptions })

    await adapter.navigate({ q: 'next', tags: ['red', 'blue'] }, { history })

    expect(router[history]).toHaveBeenCalledExactlyOnceWith({
      path: '/catalog',
      hash: '#section',
      query: { q: 'next', tags: ['red', 'blue'] },
    })
    expect(adapter.defaultOptions).toBe(defaultOptions)
  })

  it('defaults to replacing and waits for navigation to complete', async () => {
    const router = createRouter()
    let finish!: () => void
    router.replace.mockReturnValue(new Promise<void>((resolve) => {
      finish = resolve
    }))
    const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })
    const settled = vi.fn()
    const navigation = Promise.resolve(adapter.navigate({}, {})).then(settled)

    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    finish()
    await navigation
    expect(settled).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })

  describe('scroll', () => {
    function stubWindow() {
      const scrollTo = vi.fn()
      vi.stubGlobal('window', { scrollTo })
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      return scrollTo
    }

    function deferredNavigation(router: ReturnType<typeof createRouter>) {
      let finish!: () => void
      router.replace.mockReturnValue(new Promise<void>((resolve) => {
        finish = resolve
      }))
      return () => finish()
    }

    it('scrolls to the top-left for true after the DOM update', async () => {
      const scrollTo = stubWindow()
      const router = createRouter()
      const finish = deferredNavigation(router)
      const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })

      const navigation = adapter.navigate({ q: 'next' }, { scroll: true })
      await Promise.resolve()
      expect(scrollTo).not.toHaveBeenCalled()

      finish()
      await navigation
      expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 0 })
    })

    it('scrolls to a ScrollToOptions object after the DOM update', async () => {
      const scrollTo = stubWindow()
      const router = createRouter()
      const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })
      const scroll: ScrollToOptions = { top: 400, behavior: 'smooth' }

      await adapter.navigate({ q: 'next' }, { scroll })

      expect(scrollTo).toHaveBeenCalledExactlyOnceWith(scroll)
    })

    it.each([
      { name: 'false', options: { scroll: false } },
      { name: 'no value', options: {} },
    ])('does not scroll for $name', async ({ options }) => {
      const scrollTo = stubWindow()
      const router = createRouter()
      const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })

      await adapter.navigate({ q: 'next' }, options)

      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not scroll when the navigation rejects', async () => {
      const scrollTo = stubWindow()
      const router = createRouter()
      router.replace.mockRejectedValueOnce(new Error('navigation aborted'))
      const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })

      await expect(adapter.navigate({ q: 'next' }, { scroll: true })).rejects.toThrow('navigation aborted')

      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not scroll without a window', async () => {
      vi.stubGlobal('window', undefined)
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      const router = createRouter()
      const adapter = createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter })

      await expect(adapter.navigate({ q: 'next' }, { scroll: true })).resolves.toBeUndefined()
    })
  })
})
