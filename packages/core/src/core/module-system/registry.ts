import type { AnyDefinedQueryParam } from '../schema/params/definition'
import type { QueryStateSchema } from '../schema/schema'
import type { QueryModuleResult } from './contract'

/**
 * Narrows the options a module accepts to its registered contract.
 *
 * For `unknown` options, uses the contract itself. Otherwise, retains the members
 * of the supplied type that are assignable to the contract.
 *
 * @typeParam TProvided - The options the caller supplied, or `unknown` while inferring.
 * @typeParam TContract - The options the module accepts.
 */
export type ModuleOptions<TProvided, TContract> = unknown extends TProvided
  ? TContract
  : Extract<TProvided, TContract>

/**
 * The open registry of module options and setup specializations, keyed by name.
 *
 * An entry declares a `states` and/or `state` signature. The parameter is the options
 * contract; the return type is the setup specialized for the bound schema and the
 * configured options, so contributed APIs and pipeline effects follow the actual callbacks.
 *
 * @typeParam TSchema - The schema the module is applied to; the single schema of a `state` signature.
 * @typeParam TOptions - The options the module was configured with, or `unknown` while inferring.
 * @typeParam TInference - The source an option callback is contextualized by, inferred
 * independently of `TOptions`; modules without such a relationship ignore it.
 *
 * @example
 * ```ts
 * declare module '@vuqs/core' {
 *   interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
 *     'my-lib:explicit-value': {
 *       state(): typeof withExplicitValue.definition.state<TSchema>
 *     }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line unused-imports/no-unused-vars -- the params exist for augmentations to key their entries against
export interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {}

/**
 * The set of names registered in {@link QueryModuleRegistry}.
 */
export type QueryModuleName = keyof QueryModuleRegistry<QueryStateSchema, unknown>

/**
 * The single-param schema a `state` signature resolves against.
 *
 * @internal
 */
// eslint-disable-next-line ts/consistent-type-definitions -- an object-literal type satisfies the QueryStateSchema index signature; an interface would not
export type SingleParamSchema<TParam extends AnyDefinedQueryParam> = { value: TParam }

type RegistryEntry<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TOptions,
  TInference,
> = QueryModuleRegistry<TSchema, TOptions, TInference>[TName]

/**
 * The options contract of a registered `states` signature.
 *
 * @internal
 */
export type QueryModuleStatesContract<TName extends QueryModuleName, TSchema extends QueryStateSchema>
  = RegistryEntry<TName, TSchema, unknown, unknown> extends { states: (options: infer TContract) => any } ? TContract : never

/**
 * The options contract of a registered `state` signature.
 *
 * @internal
 */
export type QueryModuleStateContract<TName extends QueryModuleName, TSchema extends QueryStateSchema>
  = RegistryEntry<TName, TSchema, unknown, unknown> extends { state: (options: infer TContract) => any } ? TContract : never

/**
 * The options parameter of a registered `states` signature specialized for the configured options.
 *
 * @internal
 */
export type QueryModuleStatesParam<TName extends QueryModuleName, TSchema extends QueryStateSchema, TOptions, TInference = unknown>
  = RegistryEntry<TName, TSchema, TOptions, TInference> extends { states: (options: infer TParam) => any } ? TParam : never

/**
 * The options parameter of a registered `state` signature for the configured options.
 *
 * @internal
 */
export type QueryModuleStateParam<TName extends QueryModuleName, TSchema extends QueryStateSchema, TOptions, TInference = unknown>
  = RegistryEntry<TName, TSchema, TOptions, TInference> extends { state: (options: infer TParam) => any } ? TParam : never

/**
 * The setup a registered `states` signature specializes for the schema and options.
 *
 * @internal
 */
export type QueryModuleStatesSetup<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TOptions,
  TInference,
> = RegistryEntry<TName, TSchema, TOptions, TInference> extends { states: (options: never) => infer TSetup } ? TSetup : never

/**
 * The setup a registered `state` signature specializes for the single schema and options.
 *
 * @internal
 */
export type QueryModuleStateSetup<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TOptions,
  TInference,
> = RegistryEntry<TName, TSchema, TOptions, TInference> extends { state: (options: never) => infer TSetup } ? TSetup : never

/**
 * The result a registered `states` signature produces.
 *
 * @internal
 */
export type QueryModuleStatesResult<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TOptions,
  TInference,
> = QueryModuleStatesSetup<TName, TSchema, TOptions, TInference> extends (...args: never[]) => infer TResult
  ? TResult extends QueryModuleResult ? TResult : QueryModuleResult
  : QueryModuleResult

/**
 * The result a registered `state` signature produces.
 *
 * @internal
 */
export type QueryModuleStateResult<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TOptions,
  TInference,
> = QueryModuleStateSetup<TName, TSchema, TOptions, TInference> extends (...args: never[]) => infer TResult
  ? TResult extends QueryModuleResult ? TResult : QueryModuleResult
  : QueryModuleResult

/**
 * The API a registered `states` signature contributes.
 *
 * @internal
 */
export type QueryModuleStatesApi<TName extends QueryModuleName, TSchema extends QueryStateSchema, TOptions, TInference>
  = QueryModuleStatesResult<TName, TSchema, TOptions, TInference>['api']

/**
 * The API a registered `state` signature contributes.
 *
 * @internal
 */
export type QueryModuleStateApi<TName extends QueryModuleName, TSchema extends QueryStateSchema, TOptions, TInference>
  = QueryModuleStateResult<TName, TSchema, TOptions, TInference>['api']
