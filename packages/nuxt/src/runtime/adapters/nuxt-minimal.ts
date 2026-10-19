import type { QueryAdapter, QueryAdapterDefaultOptions } from '@vuqs/core'
import type { useRouter } from '#imports'
import { nextTick } from '#imports'

/**
 * Builds a query adapter backed by Nuxt's minimal router.
 *
 * @internal
 */
export function createNuxtMinimalRouterAdapter(options: {
  router: ReturnType<typeof useRouter>
  defaultOptions?: QueryAdapterDefaultOptions
}): QueryAdapter {
  const { router, defaultOptions } = options

  return {
    debugName: 'nuxt-minimal',
    query: () => router.currentRoute.value.query,
    navigate: async (query, navigateOptions) => {
      const { path, hash } = router.currentRoute.value
      const location = { path, hash, query: query as typeof router.currentRoute.value.query }
      await (navigateOptions.history === 'push' ? router.push(location) : router.replace(location))

      const { scroll = false } = navigateOptions

      if (scroll !== false && typeof window !== 'undefined') {
        await nextTick()
        window.scrollTo(scroll === true ? { left: 0, top: 0 } : scroll)
      }
    },
    defaultOptions,
  }
}
