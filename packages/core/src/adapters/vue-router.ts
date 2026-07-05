import type { LocationQueryRaw, Router } from 'vue-router'
import type { QueryAdapter, QueryAdapterDefaultOptions } from '../core/adapter'
import type { ParsedQuery } from '../core/types'
import { useRouter } from 'vue-router'
import { provideQueryAdapter } from '../core/adapter'
import { debug } from '../core/debug/sink'

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

  return {
    query: () => router.currentRoute.value.query as ParsedQuery,
    navigate: (query, navigateOptions) => {
      // `scroll` has no per-call equivalent in vue-router (it is `scrollBehavior`), so it is ignored.
      // Carry the current hash forward: a location object without `hash` resets it to `''`.
      const location = { query: query as LocationQueryRaw, hash: router.currentRoute.value.hash }
      const historyMode = navigateOptions.history === 'push' ? 'push' : 'replace'

      debug('adapter:navigate', 'vue-router', historyMode, { ...query })

      const result = navigateOptions.history === 'push' ? router.push(location) : router.replace(location)

      // Fire-and-forget: navigation guard errors surface via `router.onError`,
      // so swallow here rather than leaking an unhandled rejection.
      return result.then(() => {}).catch((error) => {
        debug('adapter:error', 'vue-router', error)
      })
    },
    defaultOptions: options.defaultOptions,
  }
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
