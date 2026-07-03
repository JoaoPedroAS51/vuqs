import type { QueryCore } from './query-core'
import type { QueryStateSchema } from './schema'
import { effectScope } from 'vue'

/**
 * @internal
 */
export const QUERY_STATE_MODULE = Symbol('vuqs.queryStateModule')

/**
 * @internal
 */
export declare const QUERY_STATE_MODULE_API: unique symbol

/**
 * Type-only higher-kinded API descriptor for single-param modules.
 *
 * @internal
 */
export interface QueryStateModuleApiKind {
  readonly schema: QueryStateSchema
  readonly key: string
  readonly api: object
}

type ApplyQueryStateModuleApi<
  TKind extends QueryStateModuleApiKind,
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
> = (TKind & {
  readonly schema: TSchema
  readonly key: TKey
})['api']

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
export type QueryModule<TSchema extends QueryStateSchema, TApi> = (core: QueryCore<TSchema>) => TApi

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
> = QueryModule<TSchema, TQueryStatesApi> & {
  readonly [QUERY_STATE_MODULE]: {
    bivarianceHack: QueryStateModule<QueryStateSchema, TQueryStateApi>
  }['bivarianceHack']
}

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
  readonly [QUERY_STATE_MODULE_API]: infer TKind extends QueryStateModuleApiKind
} ? ApplyQueryStateModuleApi<TKind, TSchema, TKey> : TModule extends DefinedQueryModule<any, any, infer TApi>
    ? TApi
    : never

/**
 * Creates a module with grouped and single-param projections.
 *
 * @remarks
 * `queryStates` contributes API to {@link useQueryStates}. `queryState`
 * contributes API to {@link useQueryState}. The returned value is callable, so it
 * can be passed to grouped composition directly.
 *
 * @typeParam TSchema - The schema the module can run against.
 * @typeParam TQueryStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TQueryStateApi - The API added to {@link useQueryState}.
 * @param definition - The grouped and single-param projections.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - The projection used by {@link useQueryState}.
 * @returns A module that supports both composable facades.
 */
export function defineQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TQueryStateApi,
  TQueryStates extends QueryModule<TSchema, TQueryStatesApi> = QueryModule<TSchema, TQueryStatesApi>,
  TQueryState extends QueryStateModule<QueryStateSchema, TQueryStateApi> = QueryStateModule<QueryStateSchema, TQueryStateApi>,
>(
  definition: {
    queryStates: TQueryStates
    queryState: TQueryState
  },
): TQueryStates & DefinedQueryModule<TSchema, TQueryStatesApi, TQueryStateApi> & {
  readonly [QUERY_STATE_MODULE]: TQueryState
} {
  return Object.assign(definition.queryStates, {
    [QUERY_STATE_MODULE]: definition.queryState,
  }) as TQueryStates & DefinedQueryModule<TSchema, TQueryStatesApi, TQueryStateApi> & {
    readonly [QUERY_STATE_MODULE]: TQueryState
  }
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
export function applyQueryModule<TSchema extends QueryStateSchema, TAdded>(
  composable: object,
  core: QueryCore<TSchema>,
  module: QueryModule<TSchema, TAdded>,
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
  module: DefinedQueryModule<any, any, TStateApi>,
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
