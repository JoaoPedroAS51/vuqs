import type { DefinedQueryParam } from '../schema/params/definition'
import type { QueryStateSchema } from '../schema/schema'
import type { QueryCore } from './query-core'

/**
 * @internal
 */
export const QUERY_STATE_MODULE = Symbol('vuqs.queryStateModule')

/**
 * A module projection that contributes API to {@link useQueryStates}.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TApi - The API this module adds.
 */
export type QueryStatesModule<TSchema extends QueryStateSchema, TApi> = (core: QueryCore<TSchema>) => TApi

/**
 * A module projection that contributes API to {@link useQueryState}.
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
 * A module defined for {@link useQueryStates}.
 *
 * @typeParam TSchema - The grouped schema the module can run against.
 * @typeParam TApi - The API added to {@link useQueryStates}.
 */
export type DefinedQueryStatesModule<TSchema extends QueryStateSchema, TApi> = QueryStatesModule<TSchema, TApi>

/**
 * A module defined for {@link useQueryState}.
 *
 * @typeParam TApi - The API added to {@link useQueryState}.
 */
export interface DefinedQueryStateModule<TApi> {
  readonly [QUERY_STATE_MODULE]: AnyQueryStateModule<TApi>
}

/**
 * A module defined for both query-state facades.
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
 * Type-only marker carrying the {@link QueryModuleRegistry} name a single-only
 * registered module resolves its value-typed `state` API from.
 *
 * @internal
 */
export declare const QUERY_MODULE_NAME: unique symbol

/**
 * A grouped module ({@link useQueryStates}) tagged with the facade it targets.
 *
 * @typeParam TFacade - The facade tag (`'states'`).
 * @typeParam TSchema - The schema the grouped options key against.
 * @typeParam TApi - The API added to {@link useQueryStates}.
 */
export interface QueryStatesFacadeModule<
  TFacade extends QueryModuleFacade,
  TSchema extends QueryStateSchema,
  TApi,
> extends QueryStatesModule<TSchema, TApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

/**
 * A single-param module ({@link useQueryState}) tagged with the facade it targets.
 *
 * @typeParam TFacade - The facade tag (`'state'`).
 * @typeParam TApi - The API added to {@link useQueryState}.
 */
export interface QueryStateFacadeModule<TFacade extends QueryModuleFacade, TApi>
  extends DefinedQueryStateModule<TApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

/**
 * A single-only registered module: non-callable, carrying its
 * {@link QueryModuleRegistry} name so {@link useQueryState}'s `use` resolves the
 * `state` API against the bound param's value type.
 *
 * @typeParam TName - The registry name whose `state` facet this module resolves.
 */
export interface QueryStateNameModule<TName extends QueryModuleName>
  extends DefinedQueryStateModule<QueryModuleStateApi<TName, QueryStateSchema, string>> {
  readonly [QUERY_MODULE_KIND]: 'state'
  readonly [QUERY_MODULE_NAME]: TName
}

/**
 * Resolves the `state` API a {@link QueryStateNameModule} contributes, against the
 * concrete single schema `use` binds it to, or `never` when the module carries no
 * registry name.
 *
 * @internal
 */
export type QueryStateNameApiOf<
  TModule,
  TSchema extends QueryStateSchema,
> = TModule extends { readonly [QUERY_MODULE_NAME]: infer TName extends QueryModuleName }
  ? QueryModuleStateApi<TName, TSchema, string>
  : never

/**
 * A dual module usable on either facade, carrying a not-yet-resolved facade tag.
 *
 * @typeParam TFacade - The facade tag, resolved by `use` (or the factory default).
 * @typeParam TSchema - The schema the grouped options key against.
 * @typeParam TStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TStateApi - The API added to {@link useQueryState}.
 */
export interface QueryFacadeModule<TFacade, TSchema extends QueryStateSchema, TStatesApi, TStateApi>
  extends QueryStatesModule<TSchema, TStatesApi>, DefinedQueryStateModule<TStateApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

/**
 * The open registry of module APIs and options, keyed by name and grouped by facade.
 *
 * @typeParam TSchema - The schema the module is applied to (the single schema in a `state` facet).
 * @typeParam TParam - The module's inferred extra, constrained to `string`.
 * @example
 * ```ts
 * declare module '@vuqs/core' {
 *   interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
 *     'my-lib:selection': {
 *       state: { api: SelectionApi<QueryStateValueAt<TSchema, 'value'>> }
 *     }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line unused-imports/no-unused-vars -- the params exist for augmentations to key their entries against
export interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {}

/**
 * The set of names registered in {@link QueryModuleRegistry}.
 */
export type QueryModuleName = keyof QueryModuleRegistry<QueryStateSchema, string>

/**
 * The single-param schema a `state` facet resolves against.
 *
 * @internal
 */
// eslint-disable-next-line ts/consistent-type-definitions -- an object-literal type satisfies the QueryStateSchema index signature; an interface would not
export type SingleParamSchema<TValue> = { value: DefinedQueryParam<TValue> }

/**
 * The grouped API a registry entry contributes, or `object` when it declares no
 * `states` facet.
 *
 * @internal
 */
export type QueryModuleStatesApi<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { states: { api: infer TApi } } ? TApi : object

/**
 * The single-param API a registry entry contributes, or `object` when it declares
 * no `state` facet.
 *
 * @internal
 */
export type QueryModuleStateApi<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { state: { api: infer TApi } } ? TApi : object

/**
 * The grouped options a registry entry accepts, or `never` when it declares no
 * `states` options.
 *
 * @internal
 */
export type QueryModuleStatesOptions<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { states: { options: infer TOptions } } ? TOptions : never

/**
 * The single-param options a registry entry accepts, or `never` when it declares
 * no `state` options.
 *
 * @internal
 */
export type QueryModuleStateOptions<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { state: { options: infer TOptions } } ? TOptions : never

/**
 * The options the adaptive call form accepts for a registered module: the facade
 * `use` resolves picks the facet, an unresolved facade falls back to the union of
 * both facets' options.
 *
 * @internal
 */
export type QueryModuleAdaptiveOptions<
  TName extends QueryModuleName,
  TFacade,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = [TFacade] extends ['states']
  ? QueryModuleStatesOptions<TName, TSchema, TParam>
  : [TFacade] extends ['state']
      ? QueryModuleStateOptions<TName, TSchema, TParam>
      : QueryModuleStatesOptions<TName, TSchema, TParam> | QueryModuleStateOptions<TName, TSchema, TParam>

/**
 * Whether a registry entry declares a `states` facet.
 *
 * @internal
 */
export type QueryModuleHasStates<TName extends QueryModuleName>
  = QueryModuleRegistry<QueryStateSchema, string>[TName] extends { states: unknown } ? true : false

/**
 * Whether a registry entry declares a `state` facet.
 *
 * @internal
 */
export type QueryModuleHasState<TName extends QueryModuleName>
  = QueryModuleRegistry<QueryStateSchema, string>[TName] extends { state: unknown } ? true : false

/**
 * The module the adaptive call form produces, narrowed by which facets exist: a
 * grouped-only entry stays a callable grouped module, a single-only entry stays a
 * non-callable single module, and a dual entry carries both.
 *
 * @internal
 */
export type AdaptiveModule<
  TFacade,
  TSchema extends QueryStateSchema,
  TStatesApi,
  TStateApi,
  THasStates,
  THasState,
> = [THasStates] extends [true]
  ? [THasState] extends [true]
      ? QueryFacadeModule<TFacade, TSchema, TStatesApi, TStateApi>
      : QueryStatesFacadeModule<TFacade extends QueryModuleFacade ? TFacade : 'states', TSchema, TStatesApi>
  : QueryStateFacadeModule<'state', TStateApi>

/**
 * A module factory for a registered module: a callable with the four call forms.
 *
 * @typeParam TName - The registry name whose facets this factory resolves.
 */
export interface QueryModuleFactory<TName extends QueryModuleName> {
  <TFacade = 'base', TSchema extends QueryStateSchema = QueryStateSchema, TParam extends string = string>(
    options?: QueryModuleAdaptiveOptions<TName, NoInfer<TFacade>, NoInfer<TSchema>, TParam>,
  ): QueryFacadeModule<
    TFacade,
    TSchema,
    QueryModuleStatesApi<TName, TSchema, TParam>,
    QueryModuleStateApi<TName, TSchema, TParam>
  >
  <TSchema extends QueryStateSchema, TParam extends string = string>(
    schema: TSchema,
    options: QueryModuleStatesOptions<TName, TSchema, TParam>,
  ): QueryStatesFacadeModule<'states', TSchema, QueryModuleStatesApi<TName, TSchema, TParam>>
  <TValue, TParam extends string = string>(
    param: DefinedQueryParam<TValue>,
    options: QueryModuleStateOptions<TName, SingleParamSchema<TValue>, TParam>,
  ): QueryStateFacadeModule<'state', QueryModuleStateApi<TName, SingleParamSchema<TValue>, TParam>>
  <TParam extends string = string>(
    path: string,
    options: QueryModuleStateOptions<TName, QueryStateSchema, TParam>,
  ): QueryStateFacadeModule<'state', QueryModuleStateApi<TName, QueryStateSchema, TParam>>
}

/**
 * A module factory for a single-only registered module: its adaptive form yields a
 * non-callable {@link QueryStateNameModule}, so grouped composition rejects it,
 * while the single facade resolves the value-typed API from the registry.
 *
 * @typeParam TName - The registry name whose `state` facet this factory resolves.
 */
export interface QueryStateNameModuleFactory<TName extends QueryModuleName> {
  (options?: QueryModuleStateOptions<TName, QueryStateSchema, string>): QueryStateNameModule<TName>
  <TValue, TParam extends string = string>(
    param: DefinedQueryParam<TValue>,
    options: QueryModuleStateOptions<TName, SingleParamSchema<TValue>, TParam>,
  ): QueryStateFacadeModule<'state', QueryModuleStateApi<TName, SingleParamSchema<TValue>, TParam>>
  <TParam extends string = string>(
    path: string,
    options: QueryModuleStateOptions<TName, QueryStateSchema, TParam>,
  ): QueryStateFacadeModule<'state', QueryModuleStateApi<TName, QueryStateSchema, TParam>>
}

/**
 * A module factory for a plain (unregistered) module: a callable with the four
 * call forms, carrying the option and API types fixed by the projections.
 *
 * @typeParam TStatesApi - The API added to {@link useQueryStates}.
 * @typeParam TStateApi - The API added to {@link useQueryState}.
 * @typeParam TOptions - The options the factory accepts.
 */
export interface PlainQueryModuleFactory<TStatesApi, TStateApi, TOptions, THasStates, THasState> {
  <TFacade = 'base', TSchema extends QueryStateSchema = QueryStateSchema>(
    options?: TOptions,
  ): AdaptiveModule<TFacade, TSchema, TStatesApi, TStateApi, THasStates, THasState>
  <TSchema extends QueryStateSchema>(
    schema: TSchema,
    options: TOptions,
  ): QueryStatesFacadeModule<'states', TSchema, TStatesApi>
  <TValue>(
    param: DefinedQueryParam<TValue>,
    options: TOptions,
  ): QueryStateFacadeModule<'state', TStateApi>
  (
    path: string,
    options: TOptions,
  ): QueryStateFacadeModule<'state', TStateApi>
}
