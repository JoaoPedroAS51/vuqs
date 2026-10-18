import type { AnyDefinedQueryParam } from '../schema/params/definition'
import type { QueryStateSchema } from '../schema/schema'
import type { AnyQueryStateModule, DefinedQueryStateModule, QueryModuleResult, QueryStatesModule } from './contract'
import type { PlainQueryModuleFactory, QueryModuleFactory } from './factory-types'
import type { QueryCore } from './query-core'
import type { QueryModuleName, QueryModuleStateContract, QueryModuleStatesContract } from './registry'
import { QUERY_MODULE_INFO, QUERY_STATE_MODULE } from './contract'

type ContextualStates<TName extends QueryModuleName> = <TSchema extends QueryStateSchema, const TOptions = unknown>(
  core: QueryCore<TSchema>,
  options: TOptions & QueryModuleStatesContract<TName, TSchema>,
) => QueryModuleResult

type ContextualState<TName extends QueryModuleName> = <TSchema extends QueryStateSchema, const TOptions = unknown>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
  options: TOptions & QueryModuleStateContract<TName, TSchema>,
) => QueryModuleResult

/**
 * Builds a plain module factory whose option and result types are fixed by its callbacks.
 *
 * @typeParam TStatesResult - The result of the grouped setup.
 * @typeParam TStateResult - The result of the single-param setup.
 * @typeParam TOptions - The options shared across the call forms.
 * @param definition - The setups.
 * @param definition.name - Omitted: the plain form takes no registry name.
 * @param definition.states - Sets the module up for {@link useQueryStates}.
 * @param definition.state - Sets the module up for {@link useQueryState}.
 * @returns A factory producing a module for the resolved facade.
 *
 * @example
 * ```ts
 * const withGrouped = defineQueryModule({
 *   states: () => ({ api: { grouped: true } }),
 *   state: (_core, key) => ({ api: { single: true, key } }),
 * })
 *
 * useQueryStates(schema).use(withGrouped())
 * ```
 */
export function defineQueryModule<
  TStatesResult extends QueryModuleResult,
  TStateResult extends QueryModuleResult,
  TOptions = void,
>(
  definition: {
    name?: undefined
    states: (core: QueryCore<any>, options: TOptions) => TStatesResult
    state: (core: QueryCore<any>, key: string, options: TOptions) => TStateResult
  },
): PlainQueryModuleFactory<TStatesResult, TStateResult, TOptions, true, true>

/**
 * Builds a plain grouped-only module factory.
 *
 * @typeParam TStatesResult - The result of the grouped setup.
 * @typeParam TOptions - The options shared across the call forms.
 * @param definition - The grouped setup.
 * @param definition.name - Omitted: the plain form takes no registry name.
 * @param definition.states - Sets the module up for {@link useQueryStates}.
 * @param definition.state - Omitted: a grouped-only module has no single-param setup.
 * @returns A factory producing a grouped module.
 */
export function defineQueryModule<TStatesResult extends QueryModuleResult, TOptions = void>(
  definition: {
    name?: undefined
    states: (core: QueryCore<any>, options: TOptions) => TStatesResult
    state?: undefined
  },
): PlainQueryModuleFactory<TStatesResult, QueryModuleResult, TOptions, true, false>

/**
 * Builds a plain single-param-only module factory.
 *
 * @typeParam TStateResult - The result of the single-param setup.
 * @typeParam TOptions - The options shared across the call forms.
 * @param definition - The single-param setup.
 * @param definition.name - Omitted: the plain form takes no registry name.
 * @param definition.states - Omitted: a single-param-only module has no grouped setup.
 * @param definition.state - Sets the module up for {@link useQueryState}.
 * @returns A factory producing a single-param module.
 */
export function defineQueryModule<TStateResult extends QueryModuleResult, TOptions = void>(
  definition: {
    name?: undefined
    states?: undefined
    state: (core: QueryCore<any>, key: string, options: TOptions) => TStateResult
  },
): PlainQueryModuleFactory<QueryModuleResult, TStateResult, TOptions, false, true>

/**
 * Builds a module factory for a single-param-only registered module.
 *
 * @typeParam TName - The registry name whose `state` signature this factory resolves.
 * @typeParam TState - The actual setup callback, captured from the definition.
 * @param definition - The module name and its single-param setup.
 * @param definition.name - The {@link QueryModuleRegistry} name to resolve.
 * @param definition.states - Omitted: a single-param-only module has no grouped setup.
 * @param definition.state - Sets the module up for {@link useQueryState}; receives the core, the bound key and the options.
 * @returns A factory whose `definition` exposes the setup; calling it never runs the setup.
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
 *
 * const withExplicitValue = defineQueryModule({
 *   name: 'my-lib:explicit-value',
 *   state: (core, key) => ({
 *     api: {
 *       explicitValue: computed(() => core.state.explicitValues.value[key]),
 *     },
 *   }),
 * })
 * ```
 *
 * @see https://vuqs.dev/modules/authoring
 */
export function defineQueryModule<const TName extends QueryModuleName, TState extends ContextualState<NoInfer<TName>>>(
  definition: {
    name: TName
    states?: undefined
    state: TState
  },
): QueryModuleFactory<TName, { state: TState }>

/**
 * Builds a module factory for a grouped-only registered module.
 *
 * @typeParam TName - The registry name whose `states` signature this factory resolves.
 * @typeParam TStates - The actual setup callback, captured from the definition.
 * @param definition - The module name and its grouped setup.
 * @param definition.name - The {@link QueryModuleRegistry} name to resolve.
 * @param definition.states - Sets the module up for {@link useQueryStates}; receives the core and the options.
 * @param definition.state - Omitted: a grouped-only module has no single-param setup.
 * @returns A factory whose `definition` exposes the setup; calling it never runs the setup.
 */
export function defineQueryModule<const TName extends QueryModuleName, TStates extends ContextualStates<NoInfer<TName>>>(
  definition: {
    name: TName
    states: TStates
    state?: undefined
  },
): QueryModuleFactory<TName, { states: TStates }>

/**
 * Builds a module factory for a registered module that supports both facades.
 *
 * @typeParam TName - The registry name whose signatures this factory resolves.
 * @typeParam TStates - The actual grouped setup callback.
 * @typeParam TState - The actual single-param setup callback.
 * @param definition - The module name and its setups.
 * @param definition.name - The {@link QueryModuleRegistry} name to resolve.
 * @param definition.states - Sets the module up for {@link useQueryStates}.
 * @param definition.state - Sets the module up for {@link useQueryState}.
 * @returns A factory whose `definition` exposes the setups; calling it never runs them.
 */
export function defineQueryModule<
  const TName extends QueryModuleName,
  TStates extends ContextualStates<NoInfer<TName>>,
  TState extends ContextualState<NoInfer<TName>>,
>(
  definition: {
    name: TName
    states: TStates
    state: TState
  },
): QueryModuleFactory<TName, { states: TStates, state: TState }>

export function defineQueryModule(
  definition: {
    name?: string
    states?: (core: QueryCore<any>, options: any) => QueryModuleResult
    state?: (core: QueryCore<any>, key: any, options: any) => QueryModuleResult
  },
): unknown {
  const { name, states, state } = definition

  const factory = (...args: unknown[]): unknown => {
    const [first, second] = args
    const isTargeted = args.length >= 2 || typeof first === 'string' || isDefinedParam(first)

    if (!isTargeted) {
      return packageQueryModule({
        name,
        states: states ? (core: QueryCore<QueryStateSchema>) => states(core, first) : undefined,
        state: state
          ? <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>, key: keyof TSchema & string) => state(core, key, first)
          : undefined,
      })
    }

    if (typeof first === 'string' || isDefinedParam(first)) {
      return packageQueryModule({
        name,
        state: state
          ? <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>, key: keyof TSchema & string) => state(core, key, second)
          : undefined,
      })
    }

    return packageQueryModule({
      name,
      states: states ? (core: QueryCore<QueryStateSchema>) => states(core, second) : undefined,
    })
  }

  return Object.assign(factory, { definition: { states, state } })
}

/**
 * Packages grouped and/or single-param setup callbacks into a module value.
 *
 * @internal
 */
export function packageQueryModule(
  definition: {
    name?: string
    states?: QueryStatesModule<QueryStateSchema>
    state?: AnyQueryStateModule
  },
): QueryStatesModule<QueryStateSchema> | DefinedQueryStateModule {
  const info = { [QUERY_MODULE_INFO]: { name: definition.name } }

  if (definition.states === undefined) {
    return {
      [QUERY_STATE_MODULE]: definition.state,
      ...info,
    } as DefinedQueryStateModule
  }

  return Object.assign(definition.states, {
    [QUERY_STATE_MODULE]: definition.state,
  }, info) as QueryStatesModule<QueryStateSchema> & DefinedQueryStateModule
}

function isDefinedParam(value: unknown): value is AnyDefinedQueryParam {
  return typeof value === 'object' && value !== null && Array.isArray((value as { paths?: unknown }).paths)
}
