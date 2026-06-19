import type { LocationQueryRaw, Router } from 'vue-router'
import type { QueryAdapter, QueryAdapterDefaultOptions } from '../core/adapter'
import type { ParsedQuery } from '../core/types'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'
import { provideQueryAdapter } from '../core/adapter'
import { debugChannelForAdapter, emitDebug, emitWarn, isDebugArmed } from '../core/debug/bus'
import { isManagedNavigation } from '../core/managed-navigation'

/**
 * Options for the `vue-router` adapter factories.
 *
 * @remarks
 * Shared by {@link createVueRouterAdapter} and {@link provideVueRouterAdapter}.
 */
export interface VueRouterAdapterOptions {
  /** The router instance. Defaults to `useRouter()`, so the call must then run in a component `setup`. */
  router?: Router
  /** Default navigation and write options carried on the resulting {@link QueryAdapter}. */
  defaultOptions?: QueryAdapterDefaultOptions
}

/**
 * Builds a {@link QueryAdapter} backed by `vue-router`.
 *
 * @remarks
 * Reads `router.currentRoute.value.query` and writes with `router.replace`,
 * switching to `router.push` when the `history` option is `'push'`. Nested keys
 * such as `filters.sort` require `vue-router` to be configured with `qs` for
 * `parseQuery`/`stringifyQuery`; with the default flat parser only top-level keys
 * round-trip.
 *
 * @param options - The router (defaults to `useRouter()`) and adapter defaults.
 * @returns A query adapter to pass to {@link provideQueryAdapter} or a composable.
 *
 * @see {@link https://router.vuejs.org/ | vue-router}
 */
export function createVueRouterAdapter(options: VueRouterAdapterOptions = {}): QueryAdapter {
  const router = options.router ?? useRouter()

  const adapter: QueryAdapter = {
    debugName: 'vue-router',
    query: () => router.currentRoute.value.query as ParsedQuery,
    navigate: (query, navigateOptions) => {
      // `scroll` has no per-call equivalent in vue-router (it is `scrollBehavior`), so it is ignored.
      // Carry the current hash forward: a location object without `hash` resets it to `''`.
      const location = { query: query as LocationQueryRaw, hash: router.currentRoute.value.hash }
      const historyMode = navigateOptions.history === 'push' ? 'push' : 'replace'
      const channel = debugChannelForAdapter(adapter)
      const managed = isManagedNavigation(adapter)

      if (!managed && isDebugArmed(channel)) {
        emitDebug(channel, 'adapter:navigate', { adapter: 'vue-router', mode: historyMode, query: { ...query } })
      }

      const result = (navigateOptions.history === 'push' ? router.push(location) : router.replace(location))
        .then((failure) => {
          // Duplicating the current URL is a successful no-op. Aborted/cancelled
          // navigations did not commit and must reach the queue's rollback boundary.
          if (failure !== undefined && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
            throw failure
          }
        })

      if (managed) {
        return result
      }

      // Preserve standalone fire-and-forget behavior. The queue path propagates the
      // rejection to its batch-correlated error boundary.
      return result.catch((error) => {
        emitWarn(channel, 'adapter:error', { adapter: 'vue-router', error })
      })
    },
    defaultOptions: options.defaultOptions,
  }

  return adapter
}

/**
 * Creates a `vue-router` adapter and provides it to descendant components.
 *
 * @remarks
 * Call from a component `setup`. Equivalent to
 * `provideQueryAdapter(createVueRouterAdapter(options))`.
 *
 * @param options - The router (defaults to `useRouter()`) and adapter defaults.
 * @returns The created adapter.
 */
export function provideVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter {
  const adapter = createVueRouterAdapter(options)

  provideQueryAdapter(adapter)

  return adapter
}
