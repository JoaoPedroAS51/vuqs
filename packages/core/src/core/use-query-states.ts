import type { QueryModule } from './module'
import type { QueryCore } from './query-core'
import type { QueryStateRefValue, QueryStateSchema, QueryStateWriteValues } from './schema'
import type { NavigateOptions } from './types'
import { reactive } from 'vue'
import { createQueryBinding } from './binding'
import { applyQueryModule } from './module'

export type { DefinedQueryModule, QueryModule, QueryStateModule, QueryStatesModule } from './module'
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
  use: <TAdded>(module: QueryModule<TSchema, TAdded>) => QueryComposable<TSchema, TApi & TAdded>
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
  const { engine, refs, core } = createQueryBinding(schema, options)

  const values = reactive(refs) as WritableQueryValues<TSchema>

  function setValues(next: QueryStateWriteValues<TSchema>, perCall?: NavigateOptions): void {
    for (const key of Object.keys(next) as Array<keyof TSchema & string>) {
      if (!Object.hasOwn(schema, key)) {
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
    for (const key of Object.keys(schema) as Array<keyof TSchema & string>) {
      engine.query.set(key, undefined, perCall)
    }
  }

  Object.defineProperty(values, WRITER, { value: setValues, enumerable: false })

  const composable = { values, setValues, clear } as QueryComposable<TSchema, UseQueryStatesReturn<TSchema>>

  composable.use = <TAdded>(module: QueryModule<TSchema, TAdded>) => {
    applyQueryModule(composable, core, module)

    return composable as QueryComposable<TSchema, UseQueryStatesReturn<TSchema> & TAdded>
  }

  return composable
}
