# defineQueryModule <Badge type="info" text="@vuqs/core" />

Builds a factory that contributes API to grouped state, single state, or both.

## Usage

```ts
import { codecs, defineQueryModule, useQueryState, useQueryStates } from '@vuqs/core'
import { computed } from 'vue'

const schema = { q: codecs.string }

export const withPresence = defineQueryModule({
  queryStates: core => ({
    present: computed(() => Object.keys(core.state.selected.value)),
  }),
  queryState: (core, key) => ({
    isPresent: computed(() => core.state.selected.value[key] !== undefined),
  }),
})

useQueryStates(schema).use(withPresence()) // on a group
useQueryState('q').use(withPresence()) // on a single param
```

## Type

```ts
function defineQueryModule<TName extends QueryModuleName>(
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

function defineQueryModule<TName extends QueryModuleName>(
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

function defineQueryModule<TStatesApi, TStateApi, TOptions = void>(
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

function defineQueryModule<TStatesApi, TOptions = void>(
  definition: {
    name?: undefined
    queryStates: (core: QueryCore<any>, options: TOptions) => TStatesApi
    queryState?: undefined
  },
): PlainQueryModuleFactory<TStatesApi, object, TOptions, true, false>

function defineQueryModule<TStateApi, TOptions = void>(
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

function defineQueryModule(
  definition: {
    name?: QueryModuleName
    queryStates?: (core: QueryCore<any>, options: any) => any
    queryState?: (core: QueryCore<any>, key: any, options: any) => any
  },
): (...args: any[]) => any
```

The option/API aliases and factory types in these declarations are internal names, not package exports. `name` selects a `QueryModuleRegistry` entry; omitting it infers fixed options and API from the projections.

## Parameters

| Property | Type | Behavior |
| --- | --- | --- |
| `name` | `QueryModuleName` | Optional registry name. The registered facets determine options and API. |
| `queryStates` | `(core, options) => api` | Grouped projection. Omit for a single-only module. |
| `queryState` | `(core, key, options) => api` | Single-param projection. Omit for a grouped-only module. |

Provide at least one projection. Registered projections are generic over their schema. A plain grouped projection receives `QueryCore<any>`; the single projection is generic over schema and key.

## Return value

A factory, invoked to produce the module passed to `.use()`. The factory captures its options; `.use()` runs the projection and merges the returned API onto the same composable.

Applying a module without the receiving facade's projection throws. Returning a key already present on the base API or another module throws. Effects registered during a projection are disposed if projection or API merging fails. Successful effects follow the owning scope.

## Factory call forms

| Call | Facade and inference |
| --- | --- |
| `factory(options?)` | Adaptive. Inline `.use()` supplies the facade and schema. |
| `factory(schema, options)` | Grouped. Uses a normalized schema for option/API inference. |
| `factory(param, options)` | Single. Infers from the param's decoded value type. |
| `factory(path, options)` | Single. Selects the single option shape. |

The target arguments provide type information and select a facade. The composable applying the module supplies the actual core and bound key.

Single-only registered adaptive factories resolve their API against the bound param via the registry. This preserves value types in contributed refs and setters.

<details>
<summary>Factory declarations</summary>

```ts
type QueryModuleStatesApi<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { states: { api: infer TApi } } ? TApi : object

type QueryModuleStateApi<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { state: { api: infer TApi } } ? TApi : object

type QueryModuleStatesOptions<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { states: { options: infer TOptions } } ? TOptions : never

type QueryModuleStateOptions<
  TName extends QueryModuleName,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = QueryModuleRegistry<TSchema, TParam>[TName] extends { state: { options: infer TOptions } } ? TOptions : never

type QueryModuleAdaptiveOptions<
  TName extends QueryModuleName,
  TFacade,
  TSchema extends QueryStateSchema,
  TParam extends string,
> = [TFacade] extends ['states']
  ? QueryModuleStatesOptions<TName, TSchema, TParam>
  : [TFacade] extends ['state']
      ? QueryModuleStateOptions<TName, TSchema, TParam>
      : QueryModuleStatesOptions<TName, TSchema, TParam> | QueryModuleStateOptions<TName, TSchema, TParam>

type SingleParamSchema<TValue> = { value: DefinedQueryParam<TValue> }

type QueryModuleHasStates<TName extends QueryModuleName>
  = QueryModuleRegistry<QueryStateSchema, string>[TName] extends { states: unknown } ? true : false

type QueryModuleHasState<TName extends QueryModuleName>
  = QueryModuleRegistry<QueryStateSchema, string>[TName] extends { state: unknown } ? true : false

type AdaptiveModule<
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

interface QueryModuleFactory<TName extends QueryModuleName> {
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

interface QueryStateNameModuleFactory<TName extends QueryModuleName> {
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

interface PlainQueryModuleFactory<TStatesApi, TStateApi, TOptions, THasStates, THasState> {
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
```

These supporting types are not package exports.

</details>

## Module types

| Type | Contract |
| --- | --- |
| `QueryStatesModule<TSchema, TApi>` | Grouped projection `(core) => api`. |
| `QueryStateModule<TSchema, TApi>` | Single projection `(core, key) => api`. |
| `DefinedQueryStatesModule` | Packaged grouped module. |
| `DefinedQueryStateModule` | Packaged single projection. |
| `DefinedQueryModule` | Both projections on one module value. |
| `QueryModuleFacade` | `'state'` or `'states'`. |
| `QueryStatesFacadeModule` / `QueryStateFacadeModule` | Modules carrying a type-only facade marker. |
| `QueryFacadeModule` | Dual module with an adaptive facade marker. |

<details>
<summary>Module declarations</summary>

```ts
interface SingleQueryStateSchema<T> extends QueryStateSchema {
  value: DefinedQueryParam<T>
}

declare const QUERY_STATE_MODULE: unique symbol
declare const QUERY_MODULE_KIND: unique symbol
declare const QUERY_MODULE_NAME: unique symbol

type QueryStatesModule<TSchema extends QueryStateSchema, TApi> = (core: QueryCore<TSchema>) => TApi

type QueryStateModule<TSchema extends QueryStateSchema, TApi> = (
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
) => TApi

type AnyQueryStateModule<TApi> = <
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(
  core: QueryCore<TSchema>,
  key: TKey,
) => TApi

type DefinedQueryStatesModule<TSchema extends QueryStateSchema, TApi> = QueryStatesModule<TSchema, TApi>

interface DefinedQueryStateModule<TApi> {
  readonly [QUERY_STATE_MODULE]: AnyQueryStateModule<TApi>
}

type DefinedQueryModule<
  TSchema extends QueryStateSchema,
  TQueryStatesApi,
  TQueryStateApi,
> = DefinedQueryStatesModule<TSchema, TQueryStatesApi> & DefinedQueryStateModule<TQueryStateApi>

type QueryModuleFacade = 'state' | 'states'

interface QueryStatesFacadeModule<
  TFacade extends QueryModuleFacade,
  TSchema extends QueryStateSchema,
  TApi,
> extends QueryStatesModule<TSchema, TApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

interface QueryStateFacadeModule<TFacade extends QueryModuleFacade, TApi>
  extends DefinedQueryStateModule<TApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

interface QueryFacadeModule<TFacade, TSchema extends QueryStateSchema, TStatesApi, TStateApi>
  extends QueryStatesModule<TSchema, TStatesApi>, DefinedQueryStateModule<TStateApi> {
  readonly [QUERY_MODULE_KIND]: TFacade
}

interface QueryStateNameModule<TName extends QueryModuleName>
  extends DefinedQueryStateModule<QueryModuleStateApi<TName, QueryStateSchema, string>> {
  readonly [QUERY_MODULE_KIND]: 'state'
  readonly [QUERY_MODULE_NAME]: TName
}

type QueryStateNameApiOf<
  TModule,
  TSchema extends QueryStateSchema,
> = TModule extends { readonly [QUERY_MODULE_NAME]: infer TName extends QueryModuleName }
  ? QueryModuleStateApi<TName, TSchema, string>
  : never
```

Symbol markers, `AnyQueryStateModule`, `QueryStateNameModule`, and
`QueryStateNameApiOf` are supporting internals, not package exports.

</details>

## Related guide

[Writing a module](/modules/authoring).
