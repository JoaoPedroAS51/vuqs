import type { DefinedQueryParam } from '../schema/params/definition'
import type { QueryStateSchema } from '../schema/schema'
import type {
  AnyQueryStateModule,
  DefinedQueryStateModule,
  PlainQueryModuleFactory,
  QueryModuleFactory,
  QueryModuleName,
  QueryModuleStateApi,
  QueryModuleStateOptions,
  QueryModuleStatesApi,
  QueryModuleStatesOptions,
  QueryStateNameModuleFactory,
  QueryStatesModule,
} from './contract'
import type { QueryCore } from './query-core'
import { QUERY_STATE_MODULE } from './contract'

/**
 * Builds a module factory whose options and contributed API resolve through a
 * {@link QueryModuleRegistry} entry.
 *
 * @remarks
 * Use this form when the options or API contributed to {@link useQueryStates} or
 * {@link useQueryState} depend on the schema, the bound param's value type, or the
 * composing facade. Register the entry under `name` on {@link QueryModuleRegistry}
 * via `declare module '@vuqs/core'`, then declare the `queryStates` and
 * `queryState` projections that build each facet's API from the resolved options.
 *
 * The returned factory has four call forms: `f(options?)` (adaptive, the
 * composing `use` pins the facade and schema), `f(schema, options)` (grouped,
 * schema-checked), and `f(param, options)` / `f(path, options)` (single-param
 * bound to that param). The projections receive the resolved options as a
 * trailing argument.
 *
 * @typeParam TName - The registry name whose facets this factory resolves.
 * @param definition - The module name and its facade projections.
 * @param definition.name - The {@link QueryModuleRegistry} name to resolve.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - The projection used by {@link useQueryState}.
 * @returns A factory producing a module for the resolved facade.
 *
 * @example
 * ```ts
 * declare module '@vuqs/core' {
 *   interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
 *     'my-lib:selection': {
 *       state: { api: SelectionApi<QueryStateValueAt<TSchema, 'value'>> }
 *     }
 *   }
 * }
 *
 * const withSelection = defineQueryModule({
 *   name: 'my-lib:selection',
 *   queryState: (core, key) => ({
 *     selection: computed(() => core.state.selected.value[key]),
 *     resetTo: value => core.query.transact({ mode: 'patch', values: { [key]: value } }),
 *   }),
 * })
 * ```
 */
export function defineQueryModule<TName extends QueryModuleName>(
  definition: {
    name: TName
    queryStates?: undefined
    queryState: <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
      core: QueryCore<TSchema>,
      key: TKey,
      options: QueryModuleStateOptions<TName, TSchema, string>,
    ) => QueryModuleStateApi<TName, TSchema, string>
  },
): QueryStateNameModuleFactory<TName>

/**
 * Builds a dual or grouped-only registered module factory.
 *
 * @typeParam TName - The registry name whose facets this factory resolves.
 * @param definition - The module name and its facade projections.
 * @param definition.name - The {@link QueryModuleRegistry} name to resolve.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - The projection used by {@link useQueryState}.
 * @returns A factory producing a module for the resolved facade.
 */
export function defineQueryModule<TName extends QueryModuleName>(
  definition: {
    name: TName
    queryStates: <TSchema extends QueryStateSchema>(
      core: QueryCore<TSchema>,
      options: QueryModuleStatesOptions<TName, TSchema, string>,
    ) => QueryModuleStatesApi<TName, TSchema, string>
    queryState?: <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
      core: QueryCore<TSchema>,
      key: TKey,
      options: QueryModuleStateOptions<TName, TSchema, string>,
    ) => QueryModuleStateApi<TName, TSchema, string>
  },
): QueryModuleFactory<TName>

/**
 * Builds a plain module factory whose option and API types are fixed by its
 * projections.
 *
 * @remarks
 * Use this form when the options and contributed API do not depend on the schema,
 * the bound value, or the composing facade. The projection returns fix the API,
 * and a shared options type is taken from the projections' trailing argument. No
 * registry entry or `declare module` is needed.
 *
 * The returned factory has the same four call forms as the name form.
 *
 * @typeParam TStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TStateApi - The API added to {@link useQueryState}.
 * @typeParam TOptions - The options shared across the call forms.
 * @param definition - The facade projections.
 * @param definition.name - Omitted: the plain form takes no registry name.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - The projection used by {@link useQueryState}.
 * @returns A factory producing a module for the resolved facade.
 *
 * @example
 * ```ts
 * const withGrouped = defineQueryModule({
 *   queryStates: () => ({ grouped: true }),
 *   queryState: (_core, key) => ({ single: true, key }),
 * })
 *
 * useQueryStates(schema).use(withGrouped())
 * ```
 */
export function defineQueryModule<TStatesApi, TStateApi, TOptions = void>(
  definition: {
    name?: undefined
    queryStates: (core: QueryCore<any>, options: TOptions) => TStatesApi
    queryState: <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
      core: QueryCore<TSchema>,
      key: TKey,
      options: TOptions,
    ) => TStateApi
  },
): PlainQueryModuleFactory<TStatesApi, TStateApi, TOptions, true, true>

/**
 * Builds a plain grouped-only module factory.
 *
 * @typeParam TStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TOptions - The options shared across the call forms.
 * @param definition - The grouped projection.
 * @param definition.name - Omitted: the plain form takes no registry name.
 * @param definition.queryStates - The projection used by {@link useQueryStates}.
 * @param definition.queryState - Omitted: a grouped-only module has no single-param projection.
 * @returns A factory producing a grouped module.
 */
export function defineQueryModule<TStatesApi, TOptions = void>(
  definition: {
    name?: undefined
    queryStates: (core: QueryCore<any>, options: TOptions) => TStatesApi
    queryState?: undefined
  },
): PlainQueryModuleFactory<TStatesApi, object, TOptions, true, false>

/**
 * Builds a plain single-only module factory.
 *
 * @typeParam TStateApi - The API added to {@link useQueryState}.
 * @typeParam TOptions - The options shared across the call forms.
 * @param definition - The single-param projection.
 * @param definition.name - Omitted: the plain form takes no registry name.
 * @param definition.queryStates - Omitted: a single-only module has no grouped projection.
 * @param definition.queryState - The projection used by {@link useQueryState}.
 * @returns A factory producing a single-param module.
 */
export function defineQueryModule<TStateApi, TOptions = void>(
  definition: {
    name?: undefined
    queryStates?: undefined
    queryState: <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
      core: QueryCore<TSchema>,
      key: TKey,
      options: TOptions,
    ) => TStateApi
  },
): PlainQueryModuleFactory<object, TStateApi, TOptions, false, true>

export function defineQueryModule(
  definition: {
    name?: QueryModuleName
    queryStates?: (core: QueryCore<any>, options: any) => any
    queryState?: (core: QueryCore<any>, key: any, options: any) => any
  },
): (...args: any[]) => any {
  const queryStates = definition.queryStates as ((core: QueryCore<any>, options: unknown) => object) | undefined
  const queryState = definition.queryState as ((core: QueryCore<any>, key: unknown, options: unknown) => object) | undefined

  return (...args: unknown[]): unknown => {
    const [first, second] = args
    const isTargeted = args.length >= 2 || typeof first === 'string' || hasQueryParamPaths(first)

    if (!isTargeted) {
      const options = first
      const groupedProjection = queryStates
        ? (core: QueryCore<QueryStateSchema>) => queryStates(core, options as never)
        : undefined
      const singleProjection = queryState
        ? <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(core: QueryCore<TSchema>, key: TKey) => queryState(core, key, options as never)
        : undefined

      return packageQueryModule({ queryStates: groupedProjection, queryState: singleProjection })
    }

    const options = second

    if (typeof first === 'string' || hasQueryParamPaths(first)) {
      const singleProjection = queryState
        ? <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(core: QueryCore<TSchema>, key: TKey) => queryState(core, key, options as never)
        : undefined

      return packageQueryModule({ queryState: singleProjection })
    }

    const groupedProjection = queryStates
      ? (core: QueryCore<QueryStateSchema>) => queryStates(core, options as never)
      : undefined

    return packageQueryModule({ queryStates: groupedProjection })
  }
}

/**
 * Packages grouped and/or single-param projections into a module value.
 *
 * @remarks
 * A module with `queryStates` is callable for grouped composition; a single-only
 * module is not callable and can only be consumed by {@link useQueryState}. The
 * public {@link defineQueryModule} factory calls this to build the module value a
 * call form resolves to.
 *
 * @internal
 */
export function packageQueryModule(
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

function hasQueryParamPaths(value: unknown): value is DefinedQueryParam<unknown> {
  return typeof value === 'object' && value !== null && Array.isArray((value as { paths?: unknown }).paths)
}
