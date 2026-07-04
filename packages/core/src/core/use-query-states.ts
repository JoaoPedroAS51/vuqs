import type { QueryStatesFacadeModule, QueryStatesModule } from './module'
import type { QueryCore } from './query-core'
import type {
  NormalizeQueryStateSchema,
  QueryStateRefValue,
  QueryStateSchema,
  QueryStateSchemaInput,
  QueryStateWriteValues,
} from './schema'
import type { NavigateOptions } from './types'
import { reactive } from 'vue'
import { createQueryBinding } from './binding'
import { applyQueryStatesModule } from './module'
import { normalizeQueryStateSchema } from './schema'

export type {
  DefinedQueryModule,
  DefinedQueryStateModule,
  DefinedQueryStatesModule,
  QueryStateModule,
  QueryStatesModule,
} from './module'
export type { QueryCore } from './query-core'
export type { NavigateOptions, QueryStateNavigate } from './types'
export type { QueryStateRef, UseQueryStateReturn } from './use-query-state'

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
 * The object returned by {@link useQueryStates}: the current API plus `use`.
 *
 * @remarks
 * Each `use(module)` call runs the module against the same {@link QueryCore},
 * merges the contributed API into this object, and widens the return type with
 * that API. Call `use` synchronously while a Vue effect scope is active.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TApi - The API accumulated so far.
 */
export type QueryComposable<TSchema extends QueryStateSchema, TApi> = TApi & {
  use: {
    <TAdded>(module: QueryStatesFacadeModule<'states', TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
    <TAdded>(module: QueryStatesModule<TSchema, TAdded>): QueryComposable<TSchema, TApi & TAdded>
  }
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
 * A non-enumerable marker attached to the writable `values` map carrying its
 * option-aware batch writer, so {@link toQueryRefs} can restore per-field
 * `.set`/`.clear`. Hidden from iteration, spread, and `v-model`.
 *
 * @internal
 */
export const WRITER = Symbol('vuqs.writer')

/**
 * The writable value map plus the hidden {@link WRITER} brand. The brand is an
 * optional symbol key, so it stays invisible to normal use but lets
 * {@link toQueryRefs} tell a writable map from a readonly one.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export type WritableQueryValues<TSchema extends QueryStateSchema> = QueryStatesValues<TSchema> & {
  readonly [WRITER]?: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
}

/**
 * The shape returned by {@link useQueryStates}: a reactive `values` map plus the
 * `setValues` and `clear` batch writers.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export interface UseQueryStatesReturn<TSchema extends QueryStateSchema> extends QueryStatesActions<TSchema> {
  /** The reactive, writable value map, one entry per param. */
  values: WritableQueryValues<TSchema>
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
 *   q: queryParam('q', codecs.string),
 *   sort: queryParam('filters.sort', codecs.string),
 * })
 *
 * values.q = 'sale'
 * setValues({ q: 'lease', sort: null }, { history: 'push' })
 * ```
 */
export function useQueryStates<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: UseQueryStatesOptions = {},
): QueryComposable<NormalizeQueryStateSchema<TSchema>, UseQueryStatesReturn<NormalizeQueryStateSchema<TSchema>>> {
  const normalizedSchema = normalizeQueryStateSchema(schema)
  const { engine, refs, core } = createQueryBinding(normalizedSchema, options)

  type TNormalizedSchema = NormalizeQueryStateSchema<TSchema>

  const values = reactive(refs) as WritableQueryValues<TNormalizedSchema>

  function setValues(next: QueryStateWriteValues<TNormalizedSchema>, perCall?: NavigateOptions): void {
    for (const key of Object.keys(next) as Array<keyof TNormalizedSchema & string>) {
      if (!Object.hasOwn(normalizedSchema, key)) {
        continue
      }

      const value = (next as Record<string, unknown>)[key]

      if (value === undefined) {
        continue
      }

      engine.query.set(key, value === null ? undefined : value, perCall)
    }
  }

  function clear(perCall?: NavigateOptions): void {
    for (const key of Object.keys(normalizedSchema) as Array<keyof TNormalizedSchema & string>) {
      engine.query.set(key, undefined, perCall)
    }
  }

  Object.defineProperty(values, WRITER, { value: setValues, enumerable: false })

  const composable = {
    values,
    setValues,
    clear,
  } as QueryComposable<TNormalizedSchema, UseQueryStatesReturn<TNormalizedSchema>>

  composable.use = (<TAdded>(module: QueryStatesModule<TNormalizedSchema, TAdded>) => {
    applyQueryStatesModule(composable, core, module)

    return composable as QueryComposable<TNormalizedSchema, UseQueryStatesReturn<TNormalizedSchema> & TAdded>
  }) as QueryComposable<TNormalizedSchema, UseQueryStatesReturn<TNormalizedSchema>>['use']

  return composable
}
