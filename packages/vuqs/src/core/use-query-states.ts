import type { MaybeRefOrGetter, WritableComputedRef } from 'vue'
import type { QueryStateEngine } from './engine'
import type { QueryStateRefValue, QueryStateSchema, QueryStateWriteValues } from './schema'
import type { NavigateOptions, ParsedQuery, QueryStateNavigate } from './types'
import { computed, reactive } from 'vue'
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
 * A writable ref bound to one query field, returned by {@link useQueryState}.
 *
 * @remarks
 * Reading yields the current value, or the codec default when the field is
 * absent. Assigning `.value` schedules a write with the default navigation
 * options. `set` and `clear` do the same while accepting per-call overrides.
 * Calling `clear`, or assigning `undefined` to a nullable field, removes the
 * field from the URL.
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
 * The reactive value map returned by {@link useQueryStates}: each field is a
 * value, not a ref. Read `values.field`; assign `values.field = x` to write with
 * the default navigation options, or `values.field = undefined` to clear a
 * nullable field. Use Vue's `toRefs` to obtain individual refs.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export type QueryStatesValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRefValue<TSchema[Key]>
}

/**
 * The batch writers returned by {@link useQueryStates}.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export interface QueryStatesActions<TSchema extends QueryStateSchema> {
  /**
   * Sets several fields at once, coalesced into one navigation. Omit a field (or
   * pass `undefined`) to leave it untouched, `null` to clear it, or a value to
   * set it.
   */
  setValues: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  /** Clears every field, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * The shape returned by {@link useQueryStates}: a reactive `values` map plus the
 * `setValues` and `clear` batch writers.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export interface UseQueryStatesReturn<TSchema extends QueryStateSchema> extends QueryStatesActions<TSchema> {
  /** The reactive, writable value map, one entry per field. */
  values: QueryStatesValues<TSchema>
}

/**
 * Builds the engine and one writable computed per field. Shared by
 * {@link useQueryStates} and {@link useQueryState} so neither duplicates the
 * adapter resolution or the reactive wiring.
 *
 * @internal
 */
export function createQueryStateRefs<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions,
): { engine: QueryStateEngine<TSchema>, refs: Record<string, WritableComputedRef<unknown>> } {
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

  const refs: Record<string, WritableComputedRef<unknown>> = {}

  for (const key of Object.keys(schema) as Array<keyof TSchema & string>) {
    refs[key] = computed<unknown>({
      get: () => (engine.values.value as Record<string, unknown>)[key],
      set: value => engine.setValue(key, value),
    })
  }

  return { engine, refs }
}

/**
 * Binds a schema's fields to the URL as a reactive value map.
 *
 * @remarks
 * Reads stay in sync with `query`. Writes are applied optimistically and flushed
 * to `navigate` as a single coalesced navigation, one per microtask or per
 * `throttleMs` when set. The URL is the source of truth: once it reflects a
 * write, the optimistic value for that field is reconciled away, while writes
 * the URL has not caught up to are kept so an unrelated navigation cannot discard
 * them.
 *
 * `values` is reactive: `values.field` reads, `values.field = x` writes with the
 * default options, and `values.field = undefined` clears a nullable field. Use
 * `setValues` for batch writes (with `null` to clear) and per-call options, and
 * `clear` to reset every field. For rich single-field control (a ref to pass
 * around, per-call options on one field), reach for {@link useQueryState}.
 *
 * Replace, do not mutate: assigning `values.tags = [...]` navigates, but mutating
 * the array in place (`values.tags.push(...)`) does not.
 *
 * @typeParam TSchema - The schema mapping field names to definitions.
 * @param schema - The fields to bind, keyed by logical name.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * Optional: omitted parts fall back to a provided {@link provideQueryAdapter | adapter}.
 * @returns The reactive `values` map plus the `setValues` and `clear` writers.
 * @throws {Error} When two fields declare the same query path.
 * @throws {Error} When neither `options` nor a provided adapter supplies `query` and `navigate`.
 *
 * @example
 * ```ts
 * const { values, setValues, clear } = useQueryStates(
 *   {
 *     q: defineQueryState('q', codecs.string),
 *     sort: defineQueryState('filters.sort', codecs.string),
 *   },
 *   { query: () => route.query, navigate: next => router.push({ query: stringify(next) }) },
 * )
 *
 * values.q = 'sale'
 * setValues({ q: 'lease', sort: null }, { history: 'push' })
 * ```
 */
export function useQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions = {},
): UseQueryStatesReturn<TSchema> {
  const { engine, refs } = createQueryStateRefs(schema, options)

  const values = reactive(refs) as QueryStatesValues<TSchema>

  function setValues(next: QueryStateWriteValues<TSchema>, perCall?: NavigateOptions): void {
    for (const key of Object.keys(next) as Array<keyof TSchema & string>) {
      if (!Object.hasOwn(schema, key)) {
        continue
      }

      const value = (next as Record<string, unknown>)[key]

      if (value === undefined) {
        continue
      }

      engine.setValue(key, value === null ? undefined : value, perCall)
    }
  }

  function clear(perCall?: NavigateOptions): void {
    for (const key of Object.keys(schema) as Array<keyof TSchema & string>) {
      engine.setValue(key, undefined, perCall)
    }
  }

  return { values, setValues, clear }
}
