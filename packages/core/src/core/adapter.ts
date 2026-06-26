import type { App, InjectionKey, MaybeRefOrGetter } from 'vue'
import type { NavigateOptions, ParsedQuery, QueryStateNavigate } from './types'
import { hasInjectionContext, inject, provide } from 'vue'

/**
 * Default navigation and write options carried by a {@link QueryAdapter}.
 *
 * @remarks
 * These sit near the bottom of the precedence chain: a per-call option wins over
 * a composable's instance option, which wins over these adapter defaults, which
 * win over the built-in default.
 */
export interface QueryAdapterDefaultOptions extends NavigateOptions {
  /** Coalesce writes within this many ms into one navigation. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. */
  clearOnDefault?: boolean
}

/**
 * The query and navigation boundary for the composables.
 *
 * @remarks
 * Provided by an ancestor, typically at the app root, so {@link useQueryState}
 * and {@link useQueryStates} can be called without passing `query` and `navigate`
 * each time. This is where a router integration such as `vue-router` or Nuxt
 * plugs in, keeping the core agnostic: stringifying the query, for example with
 * `qs`, lives inside `navigate`.
 */
export interface QueryAdapter {
  /** The current parsed query, as a ref, getter, or plain value. */
  query: MaybeRefOrGetter<ParsedQuery>
  /** Applies the next query to the URL. */
  navigate: QueryStateNavigate
  /** Defaults applied to every navigation unless overridden. */
  defaultOptions?: QueryAdapterDefaultOptions
}

const QUERY_ADAPTER_KEY: InjectionKey<QueryAdapter> = Symbol('vuqs-query-adapter')

/**
 * Provides a query adapter to descendant components.
 *
 * @remarks
 * Call from a component `setup`. Descendant calls to {@link useQueryStates} and
 * {@link useQueryState} then resolve `query` and `navigate` from this adapter
 * unless they are passed explicitly.
 *
 * @param adapter - The query source, navigate adapter, and optional defaults.
 */
export function provideQueryAdapter(adapter: QueryAdapter): void {
  provide(QUERY_ADAPTER_KEY, adapter)
}

/**
 * Installs a query adapter at the application level.
 *
 * @remarks
 * The app-level counterpart to {@link provideQueryAdapter}: it provides the
 * adapter on the Vue `App` rather than the current component instance, so it can
 * be called where there is no active instance, such as application setup or a
 * plugin (`installQueryAdapter(app, adapter)`). Every descendant then resolves it
 * through {@link useQueryAdapter}.
 *
 * @param app - The Vue application to provide the adapter on.
 * @param adapter - The query source, navigate adapter, and optional defaults.
 */
export function installQueryAdapter(app: App, adapter: QueryAdapter): void {
  app.provide(QUERY_ADAPTER_KEY, adapter)
}

/**
 * Reads the query adapter provided by an ancestor.
 *
 * @remarks
 * Safe to call outside a component: returns `undefined` when there is no active
 * injection context or no adapter was provided.
 *
 * @returns The provided {@link QueryAdapter}, or `undefined` when none is in scope.
 */
export function useQueryAdapter(): QueryAdapter | undefined {
  if (!hasInjectionContext()) {
    return undefined
  }

  return inject(QUERY_ADAPTER_KEY, undefined)
}
