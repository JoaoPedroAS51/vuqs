import type { QueryAdapterDefaultOptions } from '@vuqs/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createNuxtMinimalRouterAdapter } from '../../src/runtime/adapters/nuxt-minimal'

type MinimalRouter = Parameters<typeof createNuxtMinimalRouterAdapter>[0]['router']

function makeRouter() {
  const currentRoute = { value: { path: '/catalog', hash: '#section', query: { q: 'initial' } } }
  return { currentRoute, replace: vi.fn(), push: vi.fn() }
}

function makeAdapter(router: ReturnType<typeof makeRouter>, defaultOptions?: QueryAdapterDefaultOptions) {
  return createNuxtMinimalRouterAdapter({ router: router as unknown as MinimalRouter, defaultOptions })
}

function deferNavigation(router: ReturnType<typeof makeRouter>) {
  let finish!: () => void
  router.replace.mockReturnValue(new Promise<void>((resolve) => {
    finish = resolve
  }))
  return () => finish()
}

describe('createNuxtMinimalRouterAdapter', () => {
  describe('query', () => {
    it('reads the current query through a getter', () => {
      const router = makeRouter()
      const adapter = makeAdapter(router)

      const readQuery = adapter.query as () => unknown
      expect(readQuery()).toEqual({ q: 'initial' })
      router.currentRoute.value.query = { q: 'changed' }
      expect(readQuery()).toEqual({ q: 'changed' })
    })
  })

  describe('history', () => {
    it('replaces by default and waits for the navigation to complete', async () => {
      const router = makeRouter()
      const finish = deferNavigation(router)
      const adapter = makeAdapter(router)
      const settled = vi.fn()
      const navigation = Promise.resolve(adapter.navigate({}, {})).then(settled)

      await Promise.resolve()
      expect(settled).not.toHaveBeenCalled()
      finish()
      await navigation
      expect(settled).toHaveBeenCalledOnce()
      expect(router.push).not.toHaveBeenCalled()
    })

    it.each(['replace', 'push'] as const)('preserves the current path and hash with %s', async (history) => {
      const router = makeRouter()
      const adapter = makeAdapter(router)

      await adapter.navigate({ q: 'next', tags: ['red', 'blue'] }, { history })

      expect(router[history]).toHaveBeenCalledExactlyOnceWith({
        path: '/catalog',
        hash: '#section',
        query: { q: 'next', tags: ['red', 'blue'] },
      })
    })
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

    it('scrolls to the top-left for true after the DOM update', async () => {
      const scrollTo = stubWindow()
      const router = makeRouter()
      const finish = deferNavigation(router)
      const adapter = makeAdapter(router)

      const navigation = adapter.navigate({ q: 'next' }, { scroll: true })
      await Promise.resolve()
      expect(scrollTo).not.toHaveBeenCalled()

      finish()
      await navigation
      expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 0 })
    })

    it('scrolls to a ScrollToOptions object after the DOM update', async () => {
      const scrollTo = stubWindow()
      const adapter = makeAdapter(makeRouter())
      const scroll: ScrollToOptions = { top: 400, behavior: 'smooth' }

      await adapter.navigate({ q: 'next' }, { scroll })

      expect(scrollTo).toHaveBeenCalledExactlyOnceWith(scroll)
    })

    it.each([
      { name: 'false', options: { scroll: false } },
      { name: 'no value', options: {} },
    ])('does not scroll for $name', async ({ options }) => {
      const scrollTo = stubWindow()
      const adapter = makeAdapter(makeRouter())

      await adapter.navigate({ q: 'next' }, options)

      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not scroll when the navigation rejects', async () => {
      const scrollTo = stubWindow()
      const router = makeRouter()
      router.replace.mockRejectedValueOnce(new Error('navigation aborted'))
      const adapter = makeAdapter(router)

      await expect(adapter.navigate({ q: 'next' }, { scroll: true })).rejects.toThrow('navigation aborted')

      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not scroll without a window', async () => {
      vi.stubGlobal('window', undefined)
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      const adapter = makeAdapter(makeRouter())

      await expect(adapter.navigate({ q: 'next' }, { scroll: true })).resolves.toBeUndefined()
    })
  })

  describe('failures', () => {
    it.each(['replace', 'push'] as const)('rejects when the %s navigation fails', async (history) => {
      const router = makeRouter()
      router[history].mockRejectedValueOnce(new Error('navigation cancelled'))
      const adapter = makeAdapter(router)

      await expect(adapter.navigate({ q: 'next' }, { history })).rejects.toThrow('navigation cancelled')
    })
  })

  describe('defaultOptions', () => {
    it('exposes the configured defaultOptions', () => {
      const defaultOptions = { history: 'push' as const, throttleMs: 50 }

      const adapter = makeAdapter(makeRouter(), defaultOptions)

      expect(adapter.defaultOptions).toBe(defaultOptions)
    })
  })
})
