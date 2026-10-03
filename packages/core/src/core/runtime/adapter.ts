import type { MaybeRefOrGetter } from 'vue'
import type { ParsedQuery, ParsedQueryRaw } from '../query/types'

/**
 * Navigation options forwarded to the `navigate` adapter.
 *
 * @remarks
 * The adapter decides how to honor each option and may ignore ones it does not
 * support.
 */
export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  history?: 'replace' | 'push'
  /** Whether the navigation should scroll. */
  scroll?: boolean
}

/**
 * The route adapter that applies a query to the URL.
 *
 * @remarks
 * Receives the next parsed query and the resolved navigation options. It is
 * responsible for stringifying the query, for example with `qs`, and performing
 * the navigation. Return `void` after a synchronous navigation, or a promise that
 * resolves after an asynchronous navigation. When the operation completes, the
 * adapter's query must expose the final state, including normalization or redirects.
 * Throw or reject on failure or cancellation. The shared runtime serializes
 * attempts and removes their pending writes when the operation completes.
 *
 * @param query - The next parsed query to write to the URL.
 * @param options - The resolved navigation options for this write.
 * @returns A promise for asynchronous navigation, or `void` for synchronous navigation.
 */
export type QueryStateNavigate = (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>

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
 * each time. Router integrations such as `vue-router` or Nuxt implement this
 * boundary. Query serialization, for example with `qs`, belongs in `navigate`.
 */
export interface QueryAdapter {
  /** Human-readable adapter identity used only by opt-in diagnostics. */
  debugName?: string
  /** The current parsed query, as a ref, getter, or plain value. */
  query: MaybeRefOrGetter<ParsedQuery>
  /** Applies the next query synchronously or asynchronously. Throws or rejects on failure or cancellation. */
  navigate: QueryStateNavigate
  /** Defaults applied to every navigation unless overridden. */
  defaultOptions?: QueryAdapterDefaultOptions
}
