import type { MaybeRefOrGetter, WritableComputedRef } from 'vue'
import type { QueryStateDefinition } from './define-query-state'
import type { QueryStateSchema, QueryStateValueOf, QueryStateValues } from './schema'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { computed, ref, toValue, watch } from 'vue'
import { buildQuery, parseQueryStates } from './schema'

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
 * the navigation. It may complete synchronously or return a promise.
 *
 * @param query - The next parsed query to write to the URL.
 * @param options - The resolved navigation options for this write.
 */
export type QueryStateNavigate = (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>

/**
 * Options for {@link useQueryStates} and {@link useQueryState}.
 *
 * @remarks
 * Extends {@link NavigateOptions}, so `history` and `scroll` set the defaults
 * applied to every navigation unless a per-call write overrides them.
 */
export interface UseQueryStatesOptions extends NavigateOptions {
  /** The current parsed query, as a ref, getter, or plain value. */
  query: MaybeRefOrGetter<ParsedQuery>
  /** Applies the next query to the URL. */
  navigate: QueryStateNavigate
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
 * @returns One {@link QueryStateRef} per schema field.
 * @throws {Error} When two fields declare the same query path.
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
  options: UseQueryStatesOptions,
): UseQueryStatesReturn<TSchema> {
  assertUniquePaths(schema)

  const { navigate, throttleMs = 0, clearOnDefault = true } = options
  const keys = Object.keys(schema) as Array<keyof TSchema & string>

  const urlValues = computed(() => parseQueryStates(schema, toValue(options.query)))
  const pending = ref<Record<string, unknown>>({})
  const state = computed<Record<string, unknown>>(() => ({ ...urlValues.value, ...pending.value }))

  // Committed model: drop a pending write once the URL reflects it. Entries the
  // URL has not caught up to are kept, so an unrelated navigation cannot discard
  // an in-flight write.
  watch(urlValues, (parsed) => {
    if (Object.keys(pending.value).length === 0) {
      return
    }

    const remaining: Record<string, unknown> = {}

    for (const [key, pendingValue] of Object.entries(pending.value)) {
      if (!isReconciled(schema[key], pendingValue, (parsed as Record<string, unknown>)[key])) {
        remaining[key] = pendingValue
      }
    }

    if (Object.keys(remaining).length !== Object.keys(pending.value).length) {
      pending.value = remaining
    }
  })

  let scheduled = false
  let scheduledOptions: NavigateOptions = {}

  function schedule(perCall: NavigateOptions | undefined): void {
    if (perCall) {
      scheduledOptions = { ...scheduledOptions, ...perCall }
    }

    if (scheduled) {
      return
    }

    scheduled = true

    const flush = (): void => {
      scheduled = false
      const navigateOptions = scheduledOptions
      scheduledOptions = {}
      commit(navigateOptions)
    }

    if (throttleMs > 0) {
      setTimeout(flush, throttleMs)
    }
    else {
      queueMicrotask(flush)
    }
  }

  function commit(perCall: NavigateOptions): void {
    const currentQuery = toValue(options.query)
    const merged = { ...parseQueryStates(schema, currentQuery), ...pending.value } as Record<string, unknown>
    const target: Record<string, unknown> = {}

    for (const key of keys) {
      const value = merged[key]

      if (value === undefined) {
        continue
      }

      const definition = schema[key]

      if (clearOnDefault && definition.defaultValue !== undefined && definition.eq(value, definition.defaultValue)) {
        continue
      }

      target[key] = value
    }

    const query = buildQuery(schema, currentQuery, target as QueryStateValues<TSchema>)

    void navigate(query, {
      history: perCall.history ?? options.history,
      scroll: perCall.scroll ?? options.scroll,
    })
  }

  function setField(key: string, value: unknown, perCall?: NavigateOptions): void {
    pending.value = { ...pending.value, [key]: value }
    schedule(perCall)
  }

  const result: Record<string, QueryStateRef<unknown>> = {}

  for (const key of keys) {
    const fieldRef = computed<unknown>({
      get: () => {
        const value = state.value[key]

        return value === undefined ? schema[key].defaultValue : value
      },
      set: value => setField(key, value),
    })

    result[key] = Object.assign(fieldRef, {
      set: (value: unknown, perCall?: NavigateOptions) => setField(key, value, perCall),
      clear: (perCall?: NavigateOptions) => setField(key, undefined, perCall),
    }) as QueryStateRef<unknown>
  }

  return result as UseQueryStatesReturn<TSchema>
}

function isReconciled(
  definition: QueryStateDefinition<any>,
  pendingValue: unknown,
  urlValue: unknown,
): boolean {
  if (pendingValue === undefined) {
    return urlValue === undefined
      || (definition.defaultValue !== undefined && definition.eq(urlValue, definition.defaultValue))
  }

  return urlValue !== undefined && definition.eq(pendingValue, urlValue)
}

function assertUniquePaths(schema: QueryStateSchema): void {
  const seen = new Set<string>()

  for (const key of Object.keys(schema)) {
    for (const path of schema[key].paths) {
      if (seen.has(path)) {
        throw new Error(`[vuqs] duplicate query path "${path}" declared by multiple fields.`)
      }

      seen.add(path)
    }
  }
}
