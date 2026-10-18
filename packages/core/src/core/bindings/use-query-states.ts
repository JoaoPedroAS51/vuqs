import type { QueryStatesUsable, StatesModuleApi, StatesModulePipeline, VerifiedStatesModule } from '../module-system/composition'
import type { QueryStatesModule } from '../module-system/contract'
import type { NavigateOptions } from '../runtime/adapter'
import type { ApplyPipelineEffects } from '../runtime/pipeline/contract'
import type { NormalizeQueryStateSchema, QueryStateSchema, QueryStateSchemaInput, QueryStateValues, QueryStateWriteValues } from '../schema/schema'
import type { QueryBindingSource, QueryReadMap, QueryReadShape, QueryStatesValues, UseQueryStatesOptions } from './binding'
import { applyQueryStatesModule } from '../module-system/apply-module'
import { normalizeQueryStateSchema } from '../schema/schema'
import { createQueryBinding, toReactiveQuery } from './binding'

/**
 * The read value of each param after the presence effects of the installed pipeline
 * descriptors. Without descriptors it is the base read contract.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TDescriptors - The installed descriptors, in installation order.
 */
export type QueryReadOf<TSchema extends QueryStateSchema, TDescriptors extends readonly unknown[]>
  = TDescriptors extends readonly []
    ? QueryReadMap<TSchema>
    : ApplyPipelineEffects<QueryReadMap<TSchema>, TDescriptors> extends infer TRead extends QueryReadShape<TSchema> ? TRead : QueryReadMap<TSchema>

/**
 * The object returned by {@link useQueryStates}: the base composable plus the API of
 * every module `use` applied, with reads that follow the modules' presence effects.
 *
 * `use` returns the same object with an extended type. Capture its return to retain
 * the accumulated module APIs and presence effects.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TApi - The API the applied modules contributed.
 * @typeParam TDescriptors - The pipeline descriptors the applied modules installed, in order.
 */
export type QueryComposable<
  TSchema extends QueryStateSchema,
  TApi extends object = object,
  TDescriptors extends readonly unknown[] = [],
> = UseQueryStatesReturn<TSchema, QueryReadOf<TSchema, TDescriptors>> & TApi & {
  use: <TModule extends QueryStatesUsable<TSchema>>(
    module: TModule & VerifiedStatesModule<TModule, TSchema>,
  ) => QueryComposable<
    TSchema,
    TApi & StatesModuleApi<TModule, TSchema>,
    [...TDescriptors, ...StatesModulePipeline<TModule, TSchema>]
  >
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
 * @typeParam TRead - The read value of each param after module effects.
 */
export interface UseQueryStatesReturn<TSchema extends QueryStateSchema, TRead extends QueryReadShape<TSchema> = QueryReadMap<TSchema>>
  extends QueryStatesActions<TSchema>, QueryBindingSource<TSchema, TRead> {
  /** The reactive, writable value map, one entry per param. */
  values: QueryStatesValues<TSchema, TRead>
}

/**
 * Binds a schema's params to the URL as a reactive value map.
 * The query source and URL writer come from the provided {@link provideQueryAdapter | adapter}.
 *
 * @typeParam TSchema - The schema mapping param names to definitions.
 * @param schema - The params to bind, keyed by logical name.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * @returns The reactive `values` map, batch writers, and `use` for module composition.
 * @throws {Error} When two params declare the same query path.
 * @throws {Error} When no adapter has been provided.
 *
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
 *
 * @see https://vuqs.dev/guide/query-state/use-query-states
 */
export function useQueryStates<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options?: UseQueryStatesOptions,
): QueryComposable<NormalizeQueryStateSchema<TSchema>>

// eslint-disable-next-line ts/explicit-function-return-type -- the object shape is inferred; the overload above is the public contract
export function useQueryStates(schema: QueryStateSchemaInput, options: UseQueryStatesOptions = {}) {
  const normalizedSchema = normalizeQueryStateSchema(schema)
  const { binding, host } = createQueryBinding(normalizedSchema, options)

  const values = toReactiveQuery(binding)

  function patch(next: QueryStateWriteValues<typeof normalizedSchema>, perCall?: NavigateOptions): void {
    binding.transact({ mode: 'patch', values: next, navigation: perCall })
  }

  function replace(next: QueryStateValues<typeof normalizedSchema>, perCall?: NavigateOptions): void {
    binding.transact({ mode: 'replace', values: next, navigation: perCall })
  }

  function clear(perCall?: NavigateOptions): void {
    replace({}, perCall)
  }

  return {
    values,
    patch,
    replace,
    clear,
    binding,
    use(module: QueryStatesModule<typeof normalizedSchema>) {
      applyQueryStatesModule(this, host, module)

      return this
    },
  }
}
