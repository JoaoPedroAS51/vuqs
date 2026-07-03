import type { QueryCore } from './query-core'
import type { QueryStateSchema } from './schema'
import { effectScope } from 'vue'

/**
 * @internal
 */
export const QUERY_STATE_MODULE = Symbol('vuqs.queryStateModule')

/**
 * Type-only marker carrying a single-param module's registry URI.
 *
 * @remarks
 * The symbol never exists at runtime. It appears only in the types produced by
 * {@link defineQueryModule} and {@link defineQueryStateApi}, so
 * {@link useQueryState} can look the contributed API up in
 * {@link QueryStateApiRegistry} against the concrete schema and key the module is
 * applied to.
 */
export declare const QUERY_STATE_MODULE_URI: unique symbol

/**
 * The open registry of value-typed single-param module APIs, keyed by URI.
 *
 * @remarks
 * A module whose {@link useQueryState} API depends on the bound param's value
 * type registers one entry here via `declare module '@vuqs/core'`, keyed by a
 * namespaced URI and parameterized by the concrete schema and key. Because the
 * schema and key arrive as real type parameters (not a polymorphic `this`), the
 * contributed API is sound in every position, including writes. Derive the bound
 * value type with {@link QueryStateValueAt}. Pair the entry with
 * {@link defineQueryStateApi}.
 *
 * @typeParam TSchema - The schema the module is applied to.
 * @typeParam TKey - The bound param's key.
 *
 * @example
 * ```ts
 * declare module '@vuqs/core' {
 *   interface QueryStateApiRegistry<TSchema extends QueryStateSchema, TKey extends keyof TSchema & string> {
 *     'my-lib:selection': SelectionApi<QueryStateValueAt<TSchema, TKey>>
 *   }
 * }
 * ```
 */
// eslint-disable-next-line unused-imports/no-unused-vars -- the params exist for augmentations to key their entries against
export interface QueryStateApiRegistry<TSchema extends QueryStateSchema, TKey extends keyof TSchema & string> {}

/**
 * The set of URIs registered in {@link QueryStateApiRegistry}.
 */
export type QueryStateApiUri = keyof QueryStateApiRegistry<QueryStateSchema, string>

/**
 * Resolves a registry URI against a concrete schema and key.
 *
 * @typeParam TUri - The registry URI describing the contributed API.
 * @typeParam TSchema - The schema the module is applied to.
 * @typeParam TKey - The bound param's key.
 */
export type ApplyQueryStateModuleApi<
  TUri extends QueryStateApiUri,
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
> = QueryStateApiRegistry<TSchema, TKey>[TUri]

/**
 * A module projection that contributes API to {@link useQueryStates}.
 *
 * @remarks
 * The module receives the shared {@link QueryCore} and returns the API merged
 * onto the composable.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TApi - The API this module adds.
 */
export type QueryStatesModule<TSchema extends QueryStateSchema, TApi> = (core: QueryCore<TSchema>) => TApi

/**
 * A module projection that contributes API to {@link useQueryState}.
 *
 * @remarks
 * The projection receives a single-param {@link QueryCore} plus the logical key
 * for that param. Use the key instead of assuming the single schema's internal
 * shape.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TApi - The API this module adds.
 */
export type QueryStateModule<TSchema extends QueryStateSchema, TApi> = (
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
) => TApi

/**
 * A single-param projection that can run against any single query-state schema.
 *
 * @internal
 */
export type AnyQueryStateModule<TApi> = <
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(
  core: QueryCore<TSchema>,
  key: TKey,
) => TApi

/**
 * A single-param projection whose contributed API is registered under a
 * {@link QueryStateApiRegistry} URI.
 *
 * @remarks
 * Built with {@link defineQueryStateApi}. The URI rides on a type-only marker,
 * so {@link defineQueryModule} carries it onto the module and
 * {@link useQueryState} resolves the API against the concrete schema and key.
 *
 * @typeParam TUri - The registry URI describing the contributed API.
 */
export interface DefinedQueryStateApi<TUri extends QueryStateApiUri> {
  <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
    core: QueryCore<TSchema>,
    key: TKey,
  ): ApplyQueryStateModuleApi<TUri, TSchema, TKey>
  readonly [QUERY_STATE_MODULE_URI]: TUri
}

/**
 * Binds a {@link QueryStateApiRegistry} URI to a single-param projection.
 *
 * @remarks
 * Use this when the API contributed to {@link useQueryState} depends on the
 * bound param's schema, key, or value type. Register the URI's API shape on
 * {@link QueryStateApiRegistry} first, then pass the result as the `queryState`
 * projection of {@link defineQueryModule}. The binding is type-only: at runtime
 * the projection is returned as-is.
 *
 * @typeParam TUri - The registry URI describing the contributed API.
 * @param uri - The registry URI whose API shape the projection returns.
 * @param project - The projection, returning the registered API resolved for the
 * schema and key it receives.
 * @returns The same projection, carrying the URI on a type-only marker.
 *
 * @example
 * ```ts
 * declare module '@vuqs/core' {
 *   interface QueryStateApiRegistry<TSchema extends QueryStateSchema, TKey extends keyof TSchema & string> {
 *     'my-lib:selection': { selection: ComputedRef<QueryStateValueAt<TSchema, TKey> | undefined> }
 *   }
 * }
 *
 * const module = defineQueryModule({
 *   queryState: defineQueryStateApi('my-lib:selection', (core, key) => ({
 *     selection: computed(() => core.state.selected.value[key]),
 *   })),
 * })
 * ```
 */
export function defineQueryStateApi<TUri extends QueryStateApiUri>(
  uri: TUri,
  project: <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
    core: QueryCore<TSchema>,
    key: TKey,
  ) => ApplyQueryStateModuleApi<TUri, TSchema, TKey>,
): DefinedQueryStateApi<TUri> {
  void uri

  return project as unknown as DefinedQueryStateApi<TUri>
}

/**
 * A module defined for {@link useQueryStates}.
 *
 * @remarks
 * This is structurally the grouped projection itself, so existing function-only
 * modules remain valid.
 *
 * @typeParam TSchema - The grouped schema the module can run against.
 * @typeParam TApi - The API added to {@link useQueryStates}.
 */
export type DefinedQueryStatesModule<TSchema extends QueryStateSchema, TApi> = QueryStatesModule<TSchema, TApi>

/**
 * A module defined for {@link useQueryState}.
 *
 * @remarks
 * Single-only modules are intentionally not callable. They carry their
 * projection on an internal symbol, so they cannot be passed to
 * {@link useQueryStates} by shape.
 *
 * @typeParam TApi - The API added to {@link useQueryState}.
 */
export interface DefinedQueryStateModule<TApi> {
  readonly [QUERY_STATE_MODULE]: AnyQueryStateModule<TApi>
}

/**
 * A module defined for both query-state facades.
 *
 * @remarks
 * The value is callable so it can still be passed to {@link useQueryStates}. The
 * single-param projection is stored on an internal symbol and consumed by
 * {@link useQueryState}.
 *
 * @typeParam TSchema - The grouped schema the module can run against.
 * @typeParam TQueryStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TQueryStateApi - The API added to {@link useQueryState}.
 */
export type DefinedQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TQueryStateApi,
> = DefinedQueryStatesModule<TSchema, TQueryStatesApi> & DefinedQueryStateModule<TQueryStateApi>

/**
 * Extracts the API a module contributes to a specific single-param core.
 *
 * @internal
 */
export type QueryStateApiOf<
  TModule,
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
> = TModule extends {
  readonly [QUERY_STATE_MODULE_URI]: infer TUri extends QueryStateApiUri
} ? ApplyQueryStateModuleApi<TUri, TSchema, TKey> : TModule extends DefinedQueryStateModule<infer TApi>
    ? TApi
    : never

/**
 * Creates a dual module whose single-param API is registered under a
 * {@link QueryStateApiRegistry} URI.
 *
 * @remarks
 * Build the `queryState` projection with {@link defineQueryStateApi} so the API
 * contributed to {@link useQueryState} resolves against the param the module is
 * applied to.
 *
 * @typeParam TSchema - The schema the module can run against.
 * @typeParam TQueryStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TUri - The registry URI describing the API added to {@link useQueryState}.
 * @param definition - The grouped projection and the registered single-param projection.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - The registered projection, from {@link defineQueryStateApi}.
 * @returns A module carrying the URI for {@link useQueryState} resolution.
 */
export function defineQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TUri extends QueryStateApiUri,
  TQueryStates extends QueryStatesModule<TSchema, TQueryStatesApi> = QueryStatesModule<TSchema, TQueryStatesApi>,
>(
  definition: {
    queryStates: TQueryStates
    queryState: DefinedQueryStateApi<TUri>
  },
): TQueryStates & DefinedQueryStatesModule<TSchema, TQueryStatesApi> & {
  readonly [QUERY_STATE_MODULE]: DefinedQueryStateApi<TUri>
  readonly [QUERY_STATE_MODULE_URI]: TUri
}
/**
 * Creates a single-only module whose API is registered under a
 * {@link QueryStateApiRegistry} URI.
 *
 * @typeParam TUri - The registry URI describing the API added to {@link useQueryState}.
 * @param definition - The single-param projection.
 * @param definition.queryStates - Omitted: a single-only module has no grouped projection.
 * @param definition.queryState - The registered projection, from {@link defineQueryStateApi}.
 * @returns A module carrying the URI for {@link useQueryState} resolution.
 */
export function defineQueryModule<TUri extends QueryStateApiUri>(
  definition: {
    queryStates?: never
    queryState: DefinedQueryStateApi<TUri>
  },
): {
  readonly [QUERY_STATE_MODULE]: DefinedQueryStateApi<TUri>
  readonly [QUERY_STATE_MODULE_URI]: TUri
}
/**
 * Creates a module with grouped and/or single-param projections.
 *
 * @remarks
 * `queryStates` contributes API to {@link useQueryStates}. `queryState`
 * contributes API to {@link useQueryState}. A module with `queryStates` is
 * callable for grouped composition; a single-only module is not callable and can
 * only be consumed by {@link useQueryState}.
 *
 * @typeParam TSchema - The schema the module can run against.
 * @typeParam TQueryStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TQueryStateApi - The API added to {@link useQueryState}.
 * @param definition - The grouped and/or single-param projections.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - The projection used by {@link useQueryState}.
 * @returns A module for the provided composable facade projections.
 */
export function defineQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TQueryStateApi,
  TQueryStates extends QueryStatesModule<TSchema, TQueryStatesApi> = QueryStatesModule<TSchema, TQueryStatesApi>,
  TQueryState extends AnyQueryStateModule<TQueryStateApi> = AnyQueryStateModule<TQueryStateApi>,
>(
  definition: {
    queryStates: TQueryStates
    queryState: TQueryState
  },
): TQueryStates & DefinedQueryModule<TSchema, TQueryStatesApi, TQueryStateApi> & {
  readonly [QUERY_STATE_MODULE]: TQueryState
}
export function defineQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TQueryStates extends QueryStatesModule<TSchema, TQueryStatesApi> = QueryStatesModule<TSchema, TQueryStatesApi>,
>(
  definition: {
    queryStates: TQueryStates
    queryState?: never
  },
): TQueryStates & DefinedQueryStatesModule<TSchema, TQueryStatesApi>
export function defineQueryModule<
  TQueryStateApi,
  TQueryState extends AnyQueryStateModule<TQueryStateApi> = AnyQueryStateModule<TQueryStateApi>,
>(
  definition: {
    queryStates?: never
    queryState: TQueryState
  },
): DefinedQueryStateModule<TQueryStateApi> & {
  readonly [QUERY_STATE_MODULE]: TQueryState
}
export function defineQueryModule(
  definition: {
    queryStates?: QueryStatesModule<QueryStateSchema, object>
    queryState?: AnyQueryStateModule<object>
  },
): QueryStatesModule<QueryStateSchema, object> | DefinedQueryStateModule<object> {
  if (definition.queryStates === undefined) {
    return {
      [QUERY_STATE_MODULE]: definition.queryState,
    } as DefinedQueryStateModule<object>
  }

  return Object.assign(definition.queryStates, {
    [QUERY_STATE_MODULE]: definition.queryState,
  }) as QueryStatesModule<QueryStateSchema, object> & DefinedQueryStateModule<object>
}

/**
 * Merges a module API onto a composable, failing on key collisions.
 *
 * @internal
 */
export function mergeModuleApi(target: object, added: object): void {
  for (const key of Object.keys(added)) {
    if (key in target) {
      throw new Error(`[vuqs] module key "${key}" is already provided by an earlier module`)
    }
  }

  Object.assign(target, added)
}

/**
 * Applies a grouped module to a composable.
 *
 * @internal
 */
export function applyQueryStatesModule<TSchema extends QueryStateSchema, TAdded>(
  composable: object,
  core: QueryCore<TSchema>,
  module: QueryStatesModule<TSchema, TAdded>,
): void {
  applyWithRollback(composable, () => module(core) as object)
}

/**
 * Applies a single-param module to a ref composable.
 *
 * @internal
 */
export function applyQueryStateModule<TSchema extends QueryStateSchema, TStateApi>(
  composable: object,
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
  module: DefinedQueryStateModule<TStateApi>,
): void {
  const project = module[QUERY_STATE_MODULE]

  if (project === undefined) {
    throw new Error('[vuqs] module does not support useQueryState()')
  }

  applyWithRollback(composable, () => project(core, key) as object)
}

function applyWithRollback(target: object, createApi: () => object): void {
  const scope = effectScope()

  try {
    const added = scope.run(createApi)

    if (added === undefined) {
      throw new Error('[vuqs] module did not return an API object')
    }

    mergeModuleApi(target, added)
  }
  catch (error) {
    scope.stop()
    throw error
  }
}
