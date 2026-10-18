import type { QueryStateSchema } from '../schema/schema'
import type { DefinedQueryStateModule, QueryModuleResult, QueryStatesModule } from './contract'
import type { QUERY_MODULE_KIND, QUERY_MODULE_NAME, QUERY_MODULE_OPTIONS, QUERY_MODULE_PRODUCERS, QUERY_MODULE_SCHEMA, QueryRegisteredMarkers } from './factory-types'
import type { QueryCore } from './query-core'
import type { QueryModuleName, QueryModuleStateApi, QueryModuleStateParam, QueryModuleStateResult, QueryModuleStatesApi, QueryModuleStatesParam, QueryModuleStatesResult } from './registry'

/**
 * The grouped setup a registered module must provide for a schema and configured options.
 *
 * @internal
 */
export type VerifiedStatesProducer<TName extends QueryModuleName, TSchema extends QueryStateSchema, TOptions, TInference = unknown> = {
  // Method syntax keeps the parameters bivariant: a module with optional or no options
  // still satisfies the specialization for the options it was configured with.
  // eslint-disable-next-line ts/method-signature-style -- method syntax is what makes the parameters bivariant
  producer(core: QueryCore<TSchema>, options: TOptions): QueryModuleStatesResult<TName, TSchema, TOptions, TInference>
}['producer']

/**
 * The single-param setup a registered module must provide for a schema and configured options.
 *
 * @internal
 */
export type VerifiedStateProducer<TName extends QueryModuleName, TSchema extends QueryStateSchema, TOptions, TInference = unknown> = {
  // eslint-disable-next-line ts/method-signature-style -- method syntax is what makes the parameters bivariant
  producer(core: QueryCore<TSchema>, key: keyof TSchema & string, options: TOptions): QueryModuleStateResult<TName, TSchema, TOptions, TInference>
}['producer']

/**
 * A module `use` accepts on a grouped composable. Also the contextual type of the factory call
 * inside `use`, which carries the surrounding schema to the configured options.
 *
 * @internal
 */
export type QueryStatesUsable<TSchema extends QueryStateSchema> = QueryStatesModule<TSchema, QueryModuleResult> & {
  readonly [QUERY_MODULE_KIND]?: 'states' | 'base'
  readonly [QUERY_MODULE_NAME]?: QueryModuleName
  readonly [QUERY_MODULE_SCHEMA]?: (schema: TSchema) => void
}

/**
 * A module `use` accepts on a single-param composable.
 *
 * @internal
 */
export type QueryStateUsable<TSchema extends QueryStateSchema> = DefinedQueryStateModule<QueryModuleResult> & {
  readonly [QUERY_MODULE_KIND]?: 'state' | 'base'
  readonly [QUERY_MODULE_NAME]?: QueryModuleName
  readonly [QUERY_MODULE_SCHEMA]?: (schema: TSchema) => void
}

// Options configured on the module must satisfy the contract of the facade it is used on.
type ConfiguredFor<TOptions, TContract> = unknown extends TOptions
  ? TOptions
  : TOptions extends TContract ? TOptions : never

/**
 * Requires a registered module's setup and options to be compatible with its registry
 * specialization for the bound schema and configured options.
 *
 * @internal
 */
export type VerifiedStatesModule<TModule, TSchema extends QueryStateSchema> = TModule extends QueryRegisteredMarkers<any, infer TName, infer TOptions, infer TInference, any, any>
  ? {
      readonly [QUERY_MODULE_PRODUCERS]?: { states: VerifiedStatesProducer<TName, TSchema, TOptions, TInference> }
      readonly [QUERY_MODULE_OPTIONS]?: ConfiguredFor<TOptions, QueryModuleStatesParam<TName, TSchema, TOptions, TInference>>
    }
  : unknown

/**
 * The single-param counterpart of {@link VerifiedStatesModule}.
 *
 * @internal
 */
export type VerifiedStateModule<TModule, TSchema extends QueryStateSchema> = TModule extends QueryRegisteredMarkers<any, infer TName, infer TOptions, infer TInference, any, any>
  ? {
      readonly [QUERY_MODULE_PRODUCERS]?: { state: VerifiedStateProducer<TName, TSchema, TOptions, TInference> }
      readonly [QUERY_MODULE_OPTIONS]?: ConfiguredFor<TOptions, QueryModuleStateParam<TName, TSchema, TOptions, TInference>>
    }
  : unknown

/**
 * The API a module contributes to a grouped composable.
 *
 * @internal
 */
export type StatesModuleApi<TModule, TSchema extends QueryStateSchema> = TModule extends QueryRegisteredMarkers<any, infer TName, infer TOptions, infer TInference, any, any>
  ? QueryModuleStatesApi<TName, TSchema, TOptions, TInference>
  : TModule extends (core: never) => infer TResult
    ? TResult extends QueryModuleResult ? TResult['api'] : object
    : object

type PipelineOfResult<TResult> = TResult extends { readonly pipeline: infer TList extends readonly unknown[] }
  ? TList
  : []

/**
 * The pipeline descriptors a module contributes to a grouped composable, in installation order.
 *
 * @internal
 */
export type StatesModulePipeline<TModule, TSchema extends QueryStateSchema> = TModule extends QueryRegisteredMarkers<any, infer TName, infer TOptions, infer TInference, any, any>
  ? PipelineOfResult<QueryModuleStatesResult<TName, TSchema, TOptions, TInference>>
  : TModule extends (core: never) => infer TResult
    ? PipelineOfResult<TResult>
    : []

/**
 * The pipeline descriptors a module contributes to a single-param composable, in installation order.
 *
 * @internal
 */
export type StateModulePipeline<TModule, TSchema extends QueryStateSchema> = TModule extends QueryRegisteredMarkers<any, infer TName, infer TOptions, infer TInference, any, any>
  ? PipelineOfResult<QueryModuleStateResult<TName, TSchema, TOptions, TInference>>
  : TModule extends DefinedQueryStateModule<infer TResult>
    ? PipelineOfResult<TResult>
    : []

/**
 * The API a module contributes to a single-param composable.
 *
 * @internal
 */
export type StateModuleApi<TModule, TSchema extends QueryStateSchema> = TModule extends QueryRegisteredMarkers<any, infer TName, infer TOptions, infer TInference, any, any>
  ? QueryModuleStateApi<TName, TSchema, TOptions, TInference>
  : TModule extends DefinedQueryStateModule<infer TResult>
    ? TResult['api']
    : object
