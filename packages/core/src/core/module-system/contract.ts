import type { MaybeRefOrGetter } from 'vue'
import type { PipelineDescriptor } from '../runtime/pipeline/contract'
import type { QueryStateSchema } from '../schema/schema'
import type { QueryCore } from './query-core'

/**
 * @internal
 */
export const QUERY_STATE_MODULE = Symbol('vuqs.queryStateModule')

/**
 * Runtime metadata of a packaged module: its declared name when it has one.
 *
 * @internal
 */
export const QUERY_MODULE_INFO = Symbol('vuqs.queryModuleInfo')

/** @internal */
export interface QueryModuleInfo {
  readonly name?: string
}

/**
 * A source of default contributions: a value, a ref or a synchronous getter. A missing or
 * `undefined` contribution keeps the lower defaults.
 */
export type QueryDefaultSource = MaybeRefOrGetter<Readonly<Record<string, unknown>> | undefined>

/** Any descriptor a module can return. */
export type QueryModulePipelineDescriptor = PipelineDescriptor<any, any, any, any, any>

/**
 * What a module setup returns: its API and the default sources and pipeline
 * registrations it contributes.
 *
 * Only returned sources and descriptors are installed, together with the module and
 * under its ownership.
 *
 * @typeParam TApi - The API merged onto the composable.
 */
export interface QueryModuleResult<TApi extends object = object> {
  /** The API merged onto the composable. */
  api: TApi
  /** Default contribution sources, installed once and ordered by installation. */
  defaults?: readonly QueryDefaultSource[]
  /** Pipeline descriptors created with `core.pipeline.define`, installed when returned. */
  pipeline?: readonly [QueryModulePipelineDescriptor?, ...QueryModulePipelineDescriptor[]]
}

/**
 * A module setup callback that contributes to {@link useQueryStates}.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TResult - The result the setup returns.
 */
export type QueryStatesModule<TSchema extends QueryStateSchema, TResult extends QueryModuleResult = QueryModuleResult>
  = (core: QueryCore<TSchema>) => TResult

/**
 * A single-param setup callback that can run against any single query-state schema.
 *
 * @internal
 */
export type AnyQueryStateModule<TResult extends QueryModuleResult = QueryModuleResult> = <
  TSchema extends QueryStateSchema,
>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
) => TResult

/**
 * A module defined for {@link useQueryState}.
 *
 * @typeParam TResult - The result the setup returns.
 */
export interface DefinedQueryStateModule<TResult extends QueryModuleResult = QueryModuleResult> {
  readonly [QUERY_STATE_MODULE]: AnyQueryStateModule<TResult>
}
