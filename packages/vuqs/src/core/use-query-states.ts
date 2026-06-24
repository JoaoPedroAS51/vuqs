import type { ComputedRef, MaybeRefOrGetter, WritableComputedRef } from 'vue'
import type { QueryStateEngine } from './engine'
import type { QueryHookBus } from './hooks'
import type { QueryPipelineBus } from './pipeline'
import type { QueryStateRefValue, QueryStateSchema, QueryStateValues, QueryStateWriteValues } from './schema'
import type { NavigateOptions, ParsedQuery, ParsedQueryRaw, QueryStateNavigate } from './types'
import { computed, reactive, toValue } from 'vue'
import { useQueryAdapter } from './adapter'
import { createQueryStateEngine } from './engine'
import { createQueryHooks } from './hooks'
import { assertUniquePaths, buildQuery, parseQueryStates } from './schema'

export type { NavigateOptions, QueryStateNavigate } from './types'

/**
 * Behavior options for {@link useQueryStates} and {@link useQueryState}.
 *
 * @remarks
 * These are knobs only: `history` and `scroll` set the navigation defaults for
 * this instance (a per-call write can override them), `throttleMs` coalesces
 * writes, and `clearOnDefault` drops default-valued params. The query source and
 * the URL writer come from the {@link provideQueryAdapter | adapter}, never from
 * here.
 */
export interface UseQueryStatesOptions extends NavigateOptions {
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
}

/**
 * A writable ref bound to one query param, returned by {@link useQueryState}.
 *
 * @remarks
 * Reading yields the current value, or the codec default when the param is
 * absent. Assigning `.value` schedules a write with the default navigation
 * options. `set` and `clear` do the same while accepting per-call overrides.
 * Calling `clear`, or assigning `undefined` to a nullable param, removes the
 * param from the URL.
 *
 * @typeParam T - The param's value type.
 */
export interface QueryStateRef<T> extends WritableComputedRef<T> {
  /** Writes `value`, optionally overriding the navigation options for this write. */
  set: (value: T, options?: NavigateOptions) => void
  /** Removes the param from the URL, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * The reactive value map returned by {@link useQueryStates}: each param is a
 * value, not a ref. Read `values.page`; assign `values.page = x` to write with
 * the default navigation options, or `values.page = undefined` to clear a
 * nullable param. Use Vue's `toRefs` to obtain individual refs.
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
   * Sets several params at once, coalesced into one navigation. Omit a param (or
   * pass `undefined`) to leave it untouched, `null` to clear it, or a value to
   * set it.
   */
  setValues: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  /** Clears every param, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * The shape returned by {@link useQueryStates}: a reactive `values` map plus the
 * `setValues` and `clear` batch writers.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export interface UseQueryStatesReturn<TSchema extends QueryStateSchema> extends QueryStatesActions<TSchema> {
  /** The reactive, writable value map, one entry per param. */
  values: QueryStatesValues<TSchema>
}

/**
 * Builds the engine and one writable computed per param. Shared by
 * {@link useQueryStates} and {@link useQueryState} so neither duplicates the
 * adapter resolution or the reactive wiring.
 *
 * @internal
 */
export function createQueryStateRefs<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions,
): {
  engine: QueryStateEngine<TSchema>
  refs: Record<string, WritableComputedRef<unknown>>
  query: MaybeRefOrGetter<ParsedQuery>
  navigate: QueryStateNavigate
  history: NavigateOptions['history']
  scroll: NavigateOptions['scroll']
} {
  assertUniquePaths(schema)

  const adapter = useQueryAdapter()

  if (adapter === undefined) {
    throw new Error(
      '[vuqs] no query adapter: provide one with provideQueryAdapter() (or installQueryAdapter() at the app level).',
    )
  }

  const { query: querySource, navigate, defaultOptions: adapterDefaults } = adapter

  const history = options.history ?? adapterDefaults?.history
  const scroll = options.scroll ?? adapterDefaults?.scroll

  const engine = createQueryStateEngine({
    schema,
    query: querySource,
    navigate,
    parse: query => parseQueryStates(schema, query),
    build: (currentQuery, values) => buildQuery(schema, currentQuery, values),
    history,
    scroll,
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

  return { engine, refs, query: querySource, navigate, history, scroll }
}

/**
 * The shared core passed to a {@link QueryModule}.
 *
 * @remarks
 * Modules use this object to derive state from the current URL selection,
 * contribute pipeline transforms, navigate with resolved defaults, and
 * coordinate with other modules through `hooks`. Treat it as an implementation
 * surface for module authors, not as app-facing state.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface QueryCore<TSchema extends QueryStateSchema> {
  /** The schema being managed. */
  schema: TSchema
  /**
   * Explicit URL selections plus the optimistic overlay, with the read pipeline
   * applied and without codec defaults.
   */
  selected: ComputedRef<QueryStateValues<TSchema>>
  /** Optimistically sets one param. */
  setValue: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
  /** Applies a full query to the URL, running the `navigate` pipeline stage and resolving the default navigation options. */
  navigate: (query: ParsedQueryRaw, options?: NavigateOptions) => void
  /** Reads the current parsed query. */
  currentQuery: () => ParsedQuery
  /** The notification bus: one module emits an event, others react. */
  hooks: QueryHookBus
  /** The transform pipeline: `tap` to contribute, `run` to shape a derived value map. */
  pipeline: QueryPipelineBus
  /** The resolved `clearOnDefault` rule, so modules building queries match the engine's write behavior. */
  clearOnDefault: boolean
}

/**
 * A unit of functionality composed with {@link QueryComposable.use}.
 *
 * @remarks
 * A module receives the {@link QueryCore} and returns the API it contributes to
 * the composable. It may derive state from the core, contribute pipeline
 * transforms, subscribe to hooks, or set up watchers. The returned object is
 * merged into the composable and widens its type.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TAdded - The API this module adds.
 */
export type QueryModule<TSchema extends QueryStateSchema, TAdded> = (core: QueryCore<TSchema>) => TAdded

/**
 * The object returned by {@link useQueryStates}: the current API plus `use`.
 *
 * @remarks
 * Each `use(module)` call runs the module against the same {@link QueryCore},
 * merges the contributed API into this object, and widens the return type with
 * that API.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TApi - The API accumulated so far.
 */
export type QueryComposable<TSchema extends QueryStateSchema, TApi> = TApi & {
  use: <TAdded>(module: QueryModule<TSchema, TAdded>) => QueryComposable<TSchema, TApi & TAdded>
}

/**
 * Binds a schema's params to the URL as a reactive value map.
 *
 * @remarks
 * Reads stay in sync with `query`. Writes are applied optimistically and flushed
 * to `navigate` as a single coalesced navigation, one per microtask or per
 * `throttleMs` when set. The URL is the source of truth: once it reflects a
 * write, the optimistic value for that param is reconciled away, while writes
 * the URL has not caught up to are kept so an unrelated navigation cannot discard
 * them.
 *
 * `values` is reactive: `values.page` reads, `values.page = x` writes with the
 * default options, and `values.page = undefined` clears a nullable param. Use
 * `setValues` for batch writes (with `null` to clear) and per-call options, and
 * `clear` to reset every param. For rich single-param control (a ref to pass
 * around, per-call options on one param), reach for {@link useQueryState}.
 *
 * Replace, do not mutate: assigning `values.tags = [...]` navigates, but mutating
 * the array in place (`values.tags.push(...)`) does not.
 *
 * @typeParam TSchema - The schema mapping param names to definitions.
 * @param schema - The params to bind, keyed by logical name.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided {@link provideQueryAdapter | adapter}.
 * @returns The reactive `values` map, batch writers, and `use` for module composition.
 * @throws {Error} When two params declare the same query path.
 * @throws {Error} When no adapter has been provided.
 *
 * @example
 * ```ts
 * // Provide the adapter once (e.g. in your app root):
 * provideQueryAdapter(createVueRouterAdapter())
 *
 * const { values, setValues, clear } = useQueryStates({
 *   q: defineQueryParam('q', codecs.string),
 *   sort: defineQueryParam('filters.sort', codecs.string),
 * })
 *
 * values.q = 'sale'
 * setValues({ q: 'lease', sort: null }, { history: 'push' })
 * ```
 */
export function useQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions = {},
): QueryComposable<TSchema, UseQueryStatesReturn<TSchema>> {
  const { engine, refs, query, navigate, history, scroll } = createQueryStateRefs(schema, options)

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

  const core: QueryCore<TSchema> = {
    schema,
    selected: engine.rawValues,
    setValue: (key, value, perCall) => engine.setValue(key, value, perCall),
    navigate: (next, perCall) => {
      const query = engine.pipeline.run('navigate', next)
      void navigate(query, { history: perCall?.history ?? history, scroll: perCall?.scroll ?? scroll })
    },
    currentQuery: () => toValue(query),
    hooks: createQueryHooks(),
    pipeline: engine.pipeline,
    clearOnDefault: engine.clearOnDefault,
  }

  const composable = { values, setValues, clear } as QueryComposable<TSchema, UseQueryStatesReturn<TSchema>>

  composable.use = <TAdded>(module: QueryModule<TSchema, TAdded>) => {
    const added = module(core)

    for (const key of Object.keys(added as Record<string, unknown>)) {
      if (key in composable) {
        throw new Error(`[vuqs] module key "${key}" is already provided by an earlier module`)
      }
    }

    Object.assign(composable, added)

    return composable as QueryComposable<TSchema, UseQueryStatesReturn<TSchema> & TAdded>
  }

  return composable
}
