import type { MaybeRefOrGetter } from 'vue'
import type { ParsedQuery, ParsedQueryRaw } from '../query/types'

/**
 * Navigation options forwarded to the `navigate` adapter.
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
 * @param query - The next parsed query to write to the URL.
 * @param options - The resolved navigation options for this write.
 * @returns A promise for asynchronous navigation, or `void` for synchronous navigation.
 */
export type QueryStateNavigate = (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>

/**
 * Default navigation and write options carried by a {@link QueryAdapter}.
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
 * @see https://vuqs.dev/guide/getting-started/adapters
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
