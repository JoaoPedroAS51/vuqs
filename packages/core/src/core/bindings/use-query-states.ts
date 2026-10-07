import type { QueryStatesFacadeModule, QueryStatesModule } from '../module-system/contract'
import type { NavigateOptions } from '../runtime/adapter'
import type { NormalizeQueryStateSchema, QueryStateSchema, QueryStateSchemaInput, QueryStateValues, QueryStateWriteValues } from '../schema/schema'
import type { QueryBindingSource, QueryStatesValues, UseQueryStatesOptions } from './binding'
import { applyQueryStatesModule } from '../module-system/apply-module'
import { normalizeQueryStateSchema } from '../schema/schema'
import { createQueryBinding, toReactiveQuery } from './binding'

/**
 * The object returned by {@link useQueryStates}: the current API plus `use`.
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
 * The batch writers returned by {@link useQueryStates}.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export interface QueryStatesActions<TSchema extends QueryStateSchema> {
  /**
   * Partially updates params as one atomic transaction. Omit a param to preserve
   * it, pass `undefined` to clear it, or a value to set it.
   * Other writes in the same adapter's coalescing window may share its navigation.
   */
  patch: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  /**
   * Replaces the whole state as one atomic transaction: sets the given params and
   * clears every param absent or explicitly `undefined`. Other writes in the
   * adapter's coalescing window may share its navigation.
   */
  replace: (values: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  /** Clears every param, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * The shape returned by {@link useQueryStates}: a reactive `values` map plus the
 * `patch`, `replace`, and `clear` batch writers.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export interface UseQueryStatesReturn<TSchema extends QueryStateSchema>
  extends QueryStatesActions<TSchema>, QueryBindingSource<TSchema> {
  /** The reactive, writable value map, one entry per param. */
  values: QueryStatesValues<TSchema>
}

/**
 * Binds a schema's params to the URL as a reactive value map.
 *
 * @typeParam TSchema - The schema mapping param names to definitions.
 * @param schema - The params to bind, keyed by logical name.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided {@link provideQueryAdapter | adapter}.
 * @returns The reactive `values` map, batch writers, and `use` for module composition.
 * @throws {Error} When two params declare the same query path.
 * @throws {Error} When no adapter has been provided.
 *
 * @see https://vuqs.dev/guide/query-state/use-query-states
 * @example
 * ```ts
 * // Provide the adapter once (e.g. in your app root):
 * provideQueryAdapter(createVueRouterAdapter())
 *
 * const { values, patch, clear } = useQueryStates({
 *   q: queryParam('q', codecs.string),
 *   sort: queryParam('filters.sort', codecs.string),
 * })
 *
 * values.q = 'sale'
 * patch({ q: 'phone', sort: undefined }, { history: 'push' })
 * ```
 */
export function useQueryStates<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: UseQueryStatesOptions = {},
): QueryComposable<NormalizeQueryStateSchema<TSchema>, UseQueryStatesReturn<NormalizeQueryStateSchema<TSchema>>> {
  const normalizedSchema = normalizeQueryStateSchema(schema)
  const { binding, core } = createQueryBinding(normalizedSchema, options)

  type TNormalizedSchema = NormalizeQueryStateSchema<TSchema>

  const values = toReactiveQuery(binding)

  function patch(next: QueryStateWriteValues<TNormalizedSchema>, perCall?: NavigateOptions): void {
    binding.transact({ mode: 'patch', values: next, navigation: perCall })
  }

  function replace(next: QueryStateValues<TNormalizedSchema>, perCall?: NavigateOptions): void {
    binding.transact({ mode: 'replace', values: next, navigation: perCall })
  }

  function clear(perCall?: NavigateOptions): void {
    replace({}, perCall)
  }

  const composable = {
    values,
    patch,
    replace,
    clear,
    binding,
  } as QueryComposable<TNormalizedSchema, UseQueryStatesReturn<TNormalizedSchema>>

  composable.use = (<TAdded>(module: QueryStatesModule<TNormalizedSchema, TAdded>) => {
    applyQueryStatesModule(composable, core, module)

    return composable as QueryComposable<TNormalizedSchema, UseQueryStatesReturn<TNormalizedSchema> & TAdded>
  }) as QueryComposable<TNormalizedSchema, UseQueryStatesReturn<TNormalizedSchema>>['use']

  return composable
}
