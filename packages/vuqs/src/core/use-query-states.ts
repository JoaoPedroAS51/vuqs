import type { MaybeRefOrGetter, WritableComputedRef } from 'vue'
import type { QueryStateSchema, QueryStateValueOf } from './schema'
import type { NavigateOptions, ParsedQuery, QueryStateNavigate } from './types'
import { computed } from 'vue'
import { useQueryAdapter } from './adapter'
import { createQueryStateEngine } from './engine'
import { assertUniquePaths, buildQuery, parseQueryStates } from './schema'

export type { NavigateOptions, QueryStateNavigate } from './types'

/**
 * Options for {@link useQueryStates} and {@link useQueryState}.
 *
 * @remarks
 * Extends {@link NavigateOptions}, so `history` and `scroll` set the defaults
 * applied to every navigation unless a per-call write overrides them.
 */
export interface UseQueryStatesOptions extends NavigateOptions {
  /** The current parsed query. Falls back to the provided {@link provideQueryAdapter | adapter}. */
  query?: MaybeRefOrGetter<ParsedQuery>
  /** Applies the next query to the URL. Falls back to the provided adapter. */
  navigate?: QueryStateNavigate
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
}

/**
 * A writable ref bound to one query field.
 *
 * @remarks
 * Reading yields the current value, or the codec default when the field is
 * absent. Assigning `.value` schedules a write with the default navigation
 * options. `set` and `clear` do the same while accepting per-call overrides.
 *
 * @typeParam T - The field's value type.
 */
export interface QueryStateRef<T> extends WritableComputedRef<T> {
  /** Writes `value`, optionally overriding the navigation options for this write. */
  set: (value: T, options?: NavigateOptions) => void
  /** Removes the field from the URL, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * The shape returned by {@link useQueryStates}: one {@link QueryStateRef} per field.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export type UseQueryStatesReturn<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRef<QueryStateValueOf<TSchema[Key]> | undefined>
}

/**
 * Binds a schema's fields to the URL as writable refs.
 *
 * @remarks
 * Reads stay in sync with `query`. Writes are applied optimistically and flushed
 * to `navigate` as a single coalesced navigation, one per microtask or per
 * `throttleMs` when set. The URL is the source of truth: once it reflects a
 * write, the optimistic value for that field is reconciled away, while writes
 * the URL has not caught up to are kept so an unrelated navigation cannot discard
 * them.
 *
 * @typeParam TSchema - The schema mapping field names to definitions.
 * @param schema - The fields to bind, keyed by logical name.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * Optional: omitted parts fall back to a provided {@link provideQueryAdapter | adapter}.
 * @returns One {@link QueryStateRef} per schema field.
 * @throws {Error} When two fields declare the same query path.
 * @throws {Error} When neither `options` nor a provided adapter supplies `query` and `navigate`.
 *
 * @example
 * ```ts
 * const { q, sort } = useQueryStates(
 *   {
 *     q: defineQueryState('q', codecs.string),
 *     sort: defineQueryState('filters.sort', codecs.string),
 *   },
 *   { query: () => route.query, navigate: next => router.push({ query: stringify(next) }) },
 * )
 * ```
 */
export function useQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions = {},
): UseQueryStatesReturn<TSchema> {
  assertUniquePaths(schema)

  const adapter = useQueryAdapter()
  const querySource = options.query ?? adapter?.query
  const navigate = options.navigate ?? adapter?.navigate

  if (querySource === undefined || navigate === undefined) {
    throw new Error(
      '[vuqs] no query source: pass `query` and `navigate` in options, or call provideQueryAdapter().',
    )
  }

  const adapterDefaults = adapter?.defaultOptions

  const engine = createQueryStateEngine({
    schema,
    query: querySource,
    navigate,
    parse: query => parseQueryStates(schema, query),
    build: (currentQuery, values) => buildQuery(schema, currentQuery, values),
    history: options.history ?? adapterDefaults?.history,
    scroll: options.scroll ?? adapterDefaults?.scroll,
    throttleMs: options.throttleMs ?? adapterDefaults?.throttleMs,
    clearOnDefault: options.clearOnDefault ?? adapterDefaults?.clearOnDefault,
  })

  const result: Record<string, QueryStateRef<unknown>> = {}

  for (const key of Object.keys(schema) as Array<keyof TSchema & string>) {
    const fieldRef = computed<unknown>({
      get: () => (engine.values.value as Record<string, unknown>)[key],
      set: value => engine.setValue(key, value),
    })

    result[key] = Object.assign(fieldRef, {
      set: (value: unknown, perCall?: NavigateOptions) => engine.setValue(key, value, perCall),
      clear: (perCall?: NavigateOptions) => engine.setValue(key, undefined, perCall),
    }) as QueryStateRef<unknown>
  }

  return result as UseQueryStatesReturn<TSchema>
}
