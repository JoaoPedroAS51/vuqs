import type { AnyDefinedQueryParam } from '../schema/params/definition'
import type { QueryStateSchema } from '../schema/schema'
import type { DefinedQueryStateModule, QueryModuleResult, QueryStatesModule } from './contract'
import type { QueryCore } from './query-core'
import type { QueryModuleName, QueryModuleStateParam, QueryModuleStatesParam, SingleParamSchema } from './registry'

/**
 * The composable facade a module targets: `'states'` is grouped
 * ({@link useQueryStates}), `'state'` is single ({@link useQueryState}).
 */
export type QueryModuleFacade = 'state' | 'states'

/**
 * Type-only marker carrying the facade a module factory was built for.
 *
 * @internal
 */
export declare const QUERY_MODULE_KIND: unique symbol

/**
 * Type-only marker carrying the {@link QueryModuleRegistry} name of a registered module.
 *
 * @internal
 */
export declare const QUERY_MODULE_NAME: unique symbol

/**
 * Type-only marker carrying the options a registered module was configured with.
 *
 * @internal
 */
export declare const QUERY_MODULE_OPTIONS: unique symbol

/**
 * Type-only marker carrying the inference source a registered module was configured with.
 *
 * @internal
 */
export declare const QUERY_MODULE_INFERENCE: unique symbol

/**
 * Type-only marker carrying the schema a registered module is applied to.
 *
 * @internal
 */
export declare const QUERY_MODULE_SCHEMA: unique symbol

/**
 * Type-only marker carrying the actual setup callbacks of a registered module.
 *
 * @internal
 */
export declare const QUERY_MODULE_PRODUCERS: unique symbol

/** The actual setup callbacks a registered module was defined with. */
export interface QueryModuleProducers {
  states?: (core: QueryCore<any>, options: any) => QueryModuleResult
  state?: (core: QueryCore<any>, key: any, options: any) => QueryModuleResult
}

/**
 * The options the adaptive call form accepts for a registered module: the facade
 * `use` resolves picks the contract, an unresolved facade accepts either.
 *
 * @internal
 */
export type QueryModuleAdaptiveContract<
  TName extends QueryModuleName,
  TFacade,
  TSchema extends QueryStateSchema,
  TOptions = unknown,
  TInference = unknown,
> = 'states' extends TFacade
  ? QueryModuleStatesParam<TName, TSchema, TOptions, TInference>
  : 'state' extends TFacade
    ? QueryModuleStateParam<TName, TSchema, TOptions, TInference>
    : QueryModuleStatesParam<TName, TSchema, TOptions, TInference> | QueryModuleStateParam<TName, TSchema, TOptions, TInference>

/**
 * The markers a registered module carries: its name, configured options and actual callbacks.
 *
 * @typeParam TFacade - The facade tag, resolved by `use`.
 * @typeParam TName - The registry name.
 * @typeParam TOptions - The options the module was configured with.
 * @typeParam TInference - The inference source the module was configured with.
 * @typeParam TProducers - The actual setup callbacks.
 * @typeParam TSchema - The schema the module is applied to.
 */
export interface QueryRegisteredMarkers<
  TFacade,
  TName extends QueryModuleName,
  TOptions,
  TInference,
  TProducers extends QueryModuleProducers,
  TSchema extends QueryStateSchema,
> {
  readonly [QUERY_MODULE_KIND]: TFacade
  readonly [QUERY_MODULE_NAME]: TName
  readonly [QUERY_MODULE_OPTIONS]?: TOptions
  readonly [QUERY_MODULE_INFERENCE]?: TInference
  readonly [QUERY_MODULE_PRODUCERS]?: TProducers
  readonly [QUERY_MODULE_SCHEMA]?: (schema: TSchema) => void
}

/**
 * A registered grouped module.
 *
 * @internal
 */
export interface QueryRegisteredStatesModule<
  TFacade,
  TName extends QueryModuleName,
  TOptions,
  TInference,
  TProducers extends QueryModuleProducers,
  TSchema extends QueryStateSchema,
> extends QueryRegisteredMarkers<TFacade, TName, TOptions, TInference, TProducers, TSchema> {
  (core: QueryCore<any>): QueryModuleResult
}

/**
 * A registered single-param module.
 *
 * @internal
 */
export interface QueryRegisteredStateModule<
  TFacade,
  TName extends QueryModuleName,
  TOptions,
  TInference,
  TProducers extends QueryModuleProducers,
  TSchema extends QueryStateSchema,
> extends QueryRegisteredMarkers<TFacade, TName, TOptions, TInference, TProducers, TSchema>, DefinedQueryStateModule {}

/**
 * A registered module usable on either facade.
 *
 * @internal
 */
export interface QueryRegisteredDualModule<
  TFacade,
  TName extends QueryModuleName,
  TOptions,
  TInference,
  TProducers extends QueryModuleProducers,
  TSchema extends QueryStateSchema,
> extends QueryRegisteredStatesModule<TFacade, TName, TOptions, TInference, TProducers, TSchema>, DefinedQueryStateModule {}

/**
 * The module the adaptive call form produces, narrowed by which facets exist.
 *
 * @internal
 */
export type AdaptiveRegisteredModule<
  TFacade,
  TName extends QueryModuleName,
  TOptions,
  TInference,
  TProducers extends QueryModuleProducers,
  TSchema extends QueryStateSchema,
> = TProducers extends { states: unknown }
  ? TProducers extends { state: unknown }
    ? QueryRegisteredDualModule<TFacade, TName, TOptions, TInference, TProducers, TSchema>
    : QueryRegisteredStatesModule<'states', TName, TOptions, TInference, TProducers, TSchema>
  : QueryRegisteredStateModule<'state', TName, TOptions, TInference, TProducers, TSchema>

/**
 * A module factory for a registered module: a callable with four call forms.
 * Calling the factory configures a module without running its setup callbacks.
 *
 * @typeParam TName - The registry name whose signatures this factory resolves.
 * @typeParam TProducers - The actual setup callbacks, exposed as `definition`.
 */
export interface QueryModuleFactory<TName extends QueryModuleName, TProducers extends QueryModuleProducers> {
  /** The setup callbacks supplied to `defineQueryModule`. */
  readonly definition: TProducers
  <TFacade = 'base', TSchema extends QueryStateSchema = QueryStateSchema, const TOptions = unknown, TInference = unknown>(
    options?: QueryModuleAdaptiveContract<TName, NoInfer<TFacade>, NoInfer<TSchema>, TOptions, TInference>,
  ): AdaptiveRegisteredModule<TFacade, TName, TOptions, TInference, TProducers, TSchema>
  <TSchema extends QueryStateSchema, const TOptions = unknown, TInference = unknown>(
    schema: TSchema,
    options: QueryModuleStatesParam<TName, NoInfer<TSchema>, TOptions, TInference>,
  ): QueryRegisteredStatesModule<'states', TName, TOptions, TInference, TProducers, TSchema>
  <TDefinition extends AnyDefinedQueryParam, const TOptions = unknown, TInference = unknown>(
    param: TDefinition,
    options: QueryModuleStateParam<TName, SingleParamSchema<NoInfer<TDefinition>>, TOptions, TInference>,
  ): QueryRegisteredStateModule<'state', TName, TOptions, TInference, TProducers, SingleParamSchema<TDefinition>>
  <const TOptions = unknown, TInference = unknown>(
    path: string,
    options: QueryModuleStateParam<TName, SingleParamSchema<AnyDefinedQueryParam>, TOptions, TInference>,
  ): QueryRegisteredStateModule<'state', TName, TOptions, TInference, TProducers, SingleParamSchema<AnyDefinedQueryParam>>
}

/**
 * A grouped module tagged with the facade it targets.
 *
 * @internal
 */
export interface QueryStatesFacadeModule<
  TFacade,
  TSchema extends QueryStateSchema,
  TResult extends QueryModuleResult,
> extends QueryStatesModule<any, TResult> {
  readonly [QUERY_MODULE_KIND]: TFacade
  readonly [QUERY_MODULE_SCHEMA]?: (schema: TSchema) => void
}

/**
 * A single-param module tagged with the facade it targets.
 *
 * @internal
 */
export interface QueryStateFacadeModule<TFacade, TResult extends QueryModuleResult>
  extends DefinedQueryStateModule<TResult> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

/**
 * A plain dual module usable on either facade.
 *
 * @internal
 */
export interface QueryFacadeModule<
  TFacade,
  TSchema extends QueryStateSchema,
  TStatesResult extends QueryModuleResult,
  TStateResult extends QueryModuleResult,
> extends QueryStatesModule<any, TStatesResult>, DefinedQueryStateModule<TStateResult> {
  readonly [QUERY_MODULE_KIND]: TFacade
  readonly [QUERY_MODULE_SCHEMA]?: (schema: TSchema) => void
}

/**
 * The module the plain adaptive call form produces, narrowed by which setups exist.
 *
 * @internal
 */
export type PlainAdaptiveModule<
  TFacade,
  TSchema extends QueryStateSchema,
  TStatesResult extends QueryModuleResult,
  TStateResult extends QueryModuleResult,
  THasStates,
  THasState,
> = [THasStates] extends [true]
  ? [THasState] extends [true]
      ? QueryFacadeModule<TFacade, TSchema, TStatesResult, TStateResult>
      : QueryStatesFacadeModule<TFacade extends QueryModuleFacade ? TFacade : 'states', TSchema, TStatesResult>
  : QueryStateFacadeModule<'state', TStateResult>

/**
 * A module factory for a plain (unregistered) module: a callable with four call forms,
 * carrying the option and result types fixed by its callbacks.
 * Calling the factory configures a module without running its setup callbacks.
 *
 * @typeParam TStatesResult - The result of the grouped setup.
 * @typeParam TStateResult - The result of the single-param setup.
 * @typeParam TOptions - The options the factory accepts.
 * @typeParam THasStates - Whether the module has a grouped setup.
 * @typeParam THasState - Whether the module has a single-param setup.
 */
export interface PlainQueryModuleFactory<
  TStatesResult extends QueryModuleResult,
  TStateResult extends QueryModuleResult,
  TOptions,
  THasStates,
  THasState,
> {
  /** The setup callbacks supplied to `defineQueryModule`. */
  readonly definition: QueryModuleProducers
  <TFacade = 'base', TSchema extends QueryStateSchema = QueryStateSchema>(
    options?: TOptions,
  ): PlainAdaptiveModule<TFacade, TSchema, TStatesResult, TStateResult, THasStates, THasState>
  <TSchema extends QueryStateSchema>(
    schema: TSchema,
    options: TOptions,
  ): QueryStatesFacadeModule<'states', TSchema, TStatesResult>
  <TDefinition extends AnyDefinedQueryParam>(
    param: TDefinition,
    options: TOptions,
  ): QueryStateFacadeModule<'state', TStateResult>
  (
    path: string,
    options: TOptions,
  ): QueryStateFacadeModule<'state', TStateResult>
}
