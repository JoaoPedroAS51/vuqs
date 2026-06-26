import type { App, Ref } from 'vue'
import type { QueryAdapter, QueryAdapterDefaultOptions } from '../core/adapter'
import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../core/types'
import { ref } from 'vue'
import { installQueryAdapter } from '../core/adapter'
import { setPath } from '../core/path'
import { resetQueues } from '../core/queues/throttle'

/**
 * The event passed to `onUrlUpdate` each time the adapter would write the URL.
 */
export interface UrlUpdateEvent {
  /** The query the adapter would write to the URL. */
  query: ParsedQueryRaw
  /** The resolved navigation options for this write. */
  options: NavigateOptions
}

/**
 * A callback invoked on each URL write. Wire it to a spy (`vi.fn()`) to assert
 * on URL updates without mocking the router.
 */
export type OnUrlUpdateFunction = (event: UrlUpdateEvent) => void

/**
 * Options for {@link createTestingAdapter}.
 */
export interface TestingAdapterOptions {
  /**
   * The initial query. A query string (with or without a leading `?`), a
   * `URLSearchParams`, or a query object. Dot-notation keys nest into objects
   * the way the core resolves paths, so `'filters.sort=name'` and
   * `{ 'filters.sort': 'name' }` both read as `{ filters: { sort: 'name' } }`,
   * matching what a router adapter delivers.
   *
   * @example
   * ```ts
   * createTestingAdapter({ searchParams: '?count=42' })
   * createTestingAdapter({ searchParams: { 'filters.sort': 'name' } })
   * createTestingAdapter({ searchParams: { filters: { sort: 'name' } } })
   * ```
   */
  searchParams?: string | URLSearchParams | ParsedQuery

  /** Invoked on each URL write. Wire to a spy to assert on URL changes. */
  onUrlUpdate?: OnUrlUpdateFunction

  /**
   * When `true`, each write updates the adapter's query so subsequent reads
   * reflect it, simulating a real adapter. When `false` (default), the query
   * stays frozen at `searchParams`, keeping each test focused on one write.
   *
   * @default false
   */
  hasMemory?: boolean

  /** Default navigation and write options carried by the adapter. */
  defaultOptions?: QueryAdapterDefaultOptions
}

/**
 * A {@link QueryAdapter} backed by an in-memory ref, with the query exposed so a
 * test can assert on the URL state directly.
 */
export interface TestingAdapter extends QueryAdapter {
  readonly query: Ref<ParsedQuery>
}

// Expand each top-level key through setPath so dot-notation keys nest, aligning
// the initial query with the dot-paths defineQueryParam binds against.
function nestPaths(flat: Record<string, ParsedQueryRaw[string]>): ParsedQuery {
  const query: ParsedQueryRaw = {}

  for (const key of Object.keys(flat)) {
    setPath(query, key, flat[key])
  }

  return query
}

function parseSearchParams(input: TestingAdapterOptions['searchParams']): ParsedQuery {
  if (!input) {
    return {}
  }

  if (typeof input !== 'string' && !(input instanceof URLSearchParams)) {
    return nestPaths(input)
  }

  const params = typeof input === 'string'
    ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
    : input

  // Repeated keys collapse into an array before nesting, so `tag=a&tag=b` reads
  // as `['a', 'b']` under one path.
  const flat: Record<string, string | string[]> = {}

  for (const [key, value] of params) {
    const existing = flat[key]

    if (existing === undefined) {
      flat[key] = value
    }
    else if (Array.isArray(existing)) {
      existing.push(value)
    }
    else {
      flat[key] = [existing, value]
    }
  }

  return nestPaths(flat)
}

/**
 * Creates a {@link QueryAdapter} backed by an in-memory ref for use in tests.
 *
 * @remarks
 * Provides an initial query parsed from `searchParams` and fires `onUrlUpdate`
 * on each write, so a test can spy on URL updates without mocking a router. Pass
 * it to {@link installQueryAdapter} or `provideQueryAdapter`.
 *
 * The shared update queue is a module-level singleton, so reset it between tests
 * with {@link resetQueues} (typically in a `beforeEach`) to keep pending writes
 * from leaking across tests.
 *
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { installQueryAdapter } from '@vuqs/core'
 * import { createTestingAdapter } from '@vuqs/core/adapters/testing'
 *
 * const onUrlUpdate = vi.fn()
 * const adapter = createTestingAdapter({ searchParams: '?count=42', onUrlUpdate })
 *
 * const app = createApp({})
 * installQueryAdapter(app, adapter)
 *
 * const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))
 * expect(count.value).toBe(42)
 * ```
 *
 * @param options - Initial query, update callback, and memory behavior.
 * @returns A {@link TestingAdapter} with the reactive query exposed for assertions.
 */
export function createTestingAdapter(options: TestingAdapterOptions = {}): TestingAdapter {
  const { hasMemory = false, onUrlUpdate, defaultOptions } = options

  const query = ref<ParsedQuery>(parseSearchParams(options.searchParams))

  const navigate = (next: ParsedQueryRaw, navOptions: NavigateOptions): void => {
    if (hasMemory) {
      query.value = next
    }

    onUrlUpdate?.({ query: next, options: navOptions })
  }

  return { query, navigate, defaultOptions }
}

/**
 * Returns a Vue plugin that installs a testing adapter on an app, for use with
 * `@vue/test-utils`.
 *
 * @remarks
 * When you also need the adapter reference (e.g. to read `adapter.query.value`),
 * call {@link createTestingAdapter} and install it yourself instead.
 *
 * @example
 * ```ts
 * import { mount } from '@vue/test-utils'
 * import { withVuqsTestingAdapter } from '@vuqs/core/adapters/testing'
 *
 * mount(MyComponent, {
 *   global: { plugins: [withVuqsTestingAdapter({ searchParams: '?count=42', onUrlUpdate })] },
 * })
 * ```
 *
 * @param options - Forwarded to {@link createTestingAdapter}.
 * @returns A function that installs the testing adapter on the given Vue app.
 */
export function withVuqsTestingAdapter(options: TestingAdapterOptions = {}): (app: App) => void {
  return (app: App) => {
    installQueryAdapter(app, createTestingAdapter(options))
  }
}

export { resetQueues }
