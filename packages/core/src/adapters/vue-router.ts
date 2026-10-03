import type { LocationQueryRaw, Router } from 'vue-router'
import type { ParsedQuery } from '../core/query/types'
import type { QueryAdapter, QueryAdapterDefaultOptions } from '../core/runtime/adapter'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'
import { provideQueryAdapter } from '../core/bindings/adapter-provider'
import { debugChannelForAdapter, emitDebug, emitWarn, isDebugArmed } from '../core/diagnostics/bus'
import { isManagedNavigation } from '../core/runtime/managed-navigation'

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
 * `navigate` confirms successful and duplicate navigations. Router errors,
 * aborted navigations, and cancelled navigations reject its promise.
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
    navigate: async (query, navigateOptions) => {
      // `scroll` has no per-call equivalent in vue-router (it is `scrollBehavior`), so it is ignored.
      // Carry the current hash forward: a location object without `hash` resets it to `''`.
      const location = { query: query as LocationQueryRaw, hash: router.currentRoute.value.hash }
      const historyMode = navigateOptions.history === 'push' ? 'push' : 'replace'
      const channel = debugChannelForAdapter(adapter)
      const managed = isManagedNavigation(adapter)

      if (!managed && isDebugArmed(channel)) {
        emitDebug(channel, 'adapter:navigate', { adapter: 'vue-router', mode: historyMode, query: { ...query } })
      }

      try {
        const failure = await (navigateOptions.history === 'push' ? router.push(location) : router.replace(location))

        // Duplicating the URL completes the attempt without changing the route.
        if (failure !== undefined && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
          throw failure
        }
      }
      catch (error) {
        if (!managed) {
          emitWarn(channel, 'adapter:error', { adapter: 'vue-router', error })
        }
        throw error
      }
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
