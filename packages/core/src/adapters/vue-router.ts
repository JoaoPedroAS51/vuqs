import type { LocationQueryRaw, RouteLocationNormalized, RouteLocationRaw, Router, RouterScrollBehavior } from 'vue-router'
import type { ParsedQuery } from '../core/query/types'
import type { NavigateOptions, QueryAdapter, QueryAdapterDefaultOptions } from '../core/runtime/adapter'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'
import { provideQueryAdapter } from '../core/bindings/adapter-provider'
import { debugChannelForAdapter, emitDebug, emitWarn, isDebugArmed } from '../core/diagnostics/bus'
import { isManagedNavigation } from '../core/runtime/managed-navigation'

/**
 * Options for the `vue-router` adapter factories.
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
 * @param options - The router (defaults to `useRouter()`) and adapter defaults.
 * @returns A query adapter to pass to {@link provideQueryAdapter} or a composable.
 *
 * @see https://vuqs.dev/guide/getting-started/adapters
 * @see {@link https://router.vuejs.org/ | vue-router}
 */
export function createVueRouterAdapter(options: VueRouterAdapterOptions = {}): QueryAdapter {
  const router = options.router ?? useRouter()

  const adapter: QueryAdapter = {
    debugName: 'vue-router',
    query: () => router.currentRoute.value.query as ParsedQuery,
    navigate: async (query, navigateOptions) => {
      // Carry the current hash forward: a location object without `hash` resets it to `''`.
      const location = { query: query as LocationQueryRaw, hash: router.currentRoute.value.hash }
      const historyMode = navigateOptions.history === 'push' ? 'push' : 'replace'
      const channel = debugChannelForAdapter(adapter)
      const managed = isManagedNavigation(adapter)

      if (!managed && isDebugArmed(channel)) {
        emitDebug(channel, 'adapter:navigate', { adapter: 'vue-router', mode: historyMode, query: { ...query } })
      }

      const releaseScroll = registerScroll(router, location, navigateOptions.scroll ?? false)

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
      finally {
        releaseScroll()
      }
    },
    defaultOptions: options.defaultOptions,
  }

  return adapter
}

/**
 * Creates a `vue-router` adapter and provides it to descendant components.
 *
 * @param options - The router (defaults to `useRouter()`) and adapter defaults.
 * @returns The created adapter.
 */
export function provideVueRouterAdapter(options?: VueRouterAdapterOptions): QueryAdapter {
  const adapter = createVueRouterAdapter(options)

  provideQueryAdapter(adapter)

  return adapter
}

// Scroll

type ScrollValue = NonNullable<NavigateOptions['scroll']>

interface PendingScroll {
  readonly fullPath: string
  readonly scroll: ScrollValue
}

interface RouterScrollState {
  wrapper?: RouterScrollBehavior
  readonly pending: PendingScroll[]
  readonly values: WeakMap<RouteLocationNormalized, ScrollValue>
}

const scrollStates = new WeakMap<Router, RouterScrollState>()

function registerScroll(router: Router, location: RouteLocationRaw, scroll: ScrollValue): () => void {
  const state = installScrollBehavior(router)
  const entry: PendingScroll = { fullPath: router.resolve(location).fullPath, scroll }

  state.pending.push(entry)

  return () => {
    const index = state.pending.indexOf(entry)

    if (index !== -1) {
      state.pending.splice(index, 1)
    }
  }
}

function installScrollBehavior(router: Router): RouterScrollState {
  const state = scrollStates.get(router) ?? createScrollState(router)
  const current = router.options.scrollBehavior
  const isWrapped = current !== undefined && current === state.wrapper

  if (!isWrapped) {
    state.wrapper = wrapScrollBehavior(router, state.values, current)
    router.options.scrollBehavior = state.wrapper
  }

  return state
}

// `afterEach` runs before the deferred `scrollBehavior` and receives the same route
// object, so a value bound here reaches only the navigation that carried it.
function createScrollState(router: Router): RouterScrollState {
  const state: RouterScrollState = { pending: [], values: new WeakMap() }

  router.afterEach((to, _from, failure) => {
    if (failure) {
      return
    }

    const index = state.pending.findIndex(entry => entry.fullPath === to.fullPath)

    if (index !== -1) {
      state.values.set(to, state.pending[index]!.scroll)
      state.pending.splice(index, 1)
    }
  })
  scrollStates.set(router, state)

  return state
}

function wrapScrollBehavior(
  router: Router,
  values: WeakMap<RouteLocationNormalized, ScrollValue>,
  base: RouterScrollBehavior | undefined,
): RouterScrollBehavior {
  return (to, from, savedPosition) => {
    const scroll = values.get(to)

    // A newer navigation may have committed before this deferred call.
    if (scroll !== undefined && to === router.currentRoute.value) {
      return scroll === true ? { left: 0, top: 0 } : scroll
    }

    return base?.(to, from, savedPosition)
  }
}
