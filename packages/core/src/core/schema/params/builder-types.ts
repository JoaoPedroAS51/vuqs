import type { ParsedQuery, ParsedQueryRaw } from '../../query/types'
import type { AnyDefinedQueryParam, DefinedQueryParam, paramChildren, ParamContract, paramContract, ParamStructure, QueryParamReadContext } from './definition'

/** @internal */
export type Simplify<T> = { [Key in keyof T]: T[Key] } & {}

/** @internal */
export type AnyObjectChildren = Record<string, AnyDefinedQueryParam>

/**
 * The declared object children of a composed param, or `never` for an atomic param.
 *
 * @typeParam TParam - The param to read the children from.
 */
export type ChildrenOf<TParam>
  = TParam extends { readonly [paramChildren]?: infer TChildren }
    ? unknown extends TChildren ? never : Extract<TChildren, AnyObjectChildren>
    : never

/**
 * The decoded value of a param before default resolution.
 *
 * @typeParam TParam - The param to read the contract from.
 */
export type ExplicitValueOf<TParam>
  = TParam extends { readonly [paramContract]?: ParamContract<infer TExplicit, any, any, any> } ? TExplicit : never

/**
 * The value of a param after applicable defaults, when it is defined.
 *
 * @typeParam TParam - The param to read the contract from.
 */
export type ResolvedValueOf<TParam>
  = TParam extends { readonly [paramContract]?: ParamContract<any, infer TResolved, any, any> } ? TResolved : never

/**
 * The value a default source can supply for a param.
 *
 * @typeParam TParam - The param to read the contract from.
 */
export type ContributionOf<TParam>
  = TParam extends { readonly [paramContract]?: ParamContract<any, any, infer TContribution, any> } ? TContribution : never

/**
 * Whether an applicable static default guarantees a defined resolved value.
 *
 * @typeParam TParam - The param to read the contract from.
 */
export type GuaranteedOf<TParam>
  = TParam extends { readonly [paramContract]?: ParamContract<any, any, any, infer TGuaranteed> } ? TGuaranteed : never

type GuaranteedChildKeys<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren]: [GuaranteedOf<TChildren[Key]>] extends [true] ? Key : never
}[keyof TChildren]

type OptionalChildKeys<TChildren extends AnyObjectChildren> = Exclude<keyof TChildren, GuaranteedChildKeys<TChildren>>

/**
 * The explicit value of an object param: every declared child is optional.
 *
 * @typeParam TChildren - The child param map.
 */
export type ObjectExplicitValue<TChildren extends AnyObjectChildren> = Simplify<{
  [Key in keyof TChildren]?: ExplicitValueOf<TChildren[Key]>
}>

/**
 * The resolved value of an object param: children with an applicable static
 * default guarantee are required.
 *
 * @typeParam TChildren - The child param map.
 */
export type ObjectResolvedValue<TChildren extends AnyObjectChildren> = Simplify<
  { [Key in GuaranteedChildKeys<TChildren>]: ResolvedValueOf<TChildren[Key]> }
  & { [Key in OptionalChildKeys<TChildren>]?: ResolvedValueOf<TChildren[Key]> }
>

/**
 * The default contribution of an object param: recursively partial through
 * declared object children, with whole values for atomic children.
 *
 * @typeParam TChildren - The child param map.
 */
export type ObjectContribution<TChildren extends AnyObjectChildren> = Simplify<{
  [Key in keyof TChildren]?: ContributionOf<TChildren[Key]>
}>

/** @internal */
export type ObjectGuaranteed<
  TChildren extends AnyObjectChildren,
  THasOwnDefault extends boolean,
  TGated extends boolean,
> = TGated extends true
  ? false
  : THasOwnDefault extends true
    ? true
    : [GuaranteedChildKeys<TChildren>] extends [never] ? false : true

/**
 * The mapping passed to `transform`: the resolved input is read into the public
 * value and the public value is written back as an explicit input.
 *
 * @typeParam TInput - The resolved input value type.
 * @typeParam TOutput - The public value type.
 * @typeParam TWrite - The explicit input value type produced by `write`.
 */
export interface QueryParamTransform<TInput, TOutput, TWrite = TInput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TWrite
  eq?: (a: TOutput, b: TOutput) => boolean
}

/**
 * A param definition with immutable, chainable modifiers.
 *
 * @typeParam T - The param's value type.
 * @typeParam TContribution - The type a default source or `withDefault` accepts.
 * @typeParam TGuaranteed - `true` once a default guarantees a defined resolved value.
 */
export interface QueryParamBuilder<T, TContribution = T, TGuaranteed extends boolean = false>
  extends DefinedQueryParam<T, T, TContribution, TGuaranteed> {
  /**
   * Sets the param's static default, replacing the previous static default.
   *
   * @returns A new builder with this default.
   */
  withDefault: (defaultValue: TContribution) => QueryParamBuilder<T, TContribution, true>
  /**
   * Sets the equality function for defined explicit values.
   *
   * @returns A new builder using `eq`.
   */
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TContribution, TGuaranteed>
  /**
   * Keeps a default-valued write in the URL: param-level `clearOnDefault: false`.
   *
   * @returns A new builder that retains default-valued writes.
   */
  keepOnDefault: () => QueryParamBuilder<T, TContribution, TGuaranteed>
  /**
   * Maps the param to a different public shape. A defined mapping of the static
   * input default provides the output default unless `withDefault` replaces it.
   *
   * @returns A new builder for the transformed value.
   */
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

/**
 * A {@link QueryParamBuilder} whose definition guarantees a defined resolved value.
 *
 * @typeParam T - The param's value type.
 * @typeParam TContribution - The type a default source or `withDefault` accepts.
 */
export type QueryParamBuilderWithDefault<T, TContribution = T> = QueryParamBuilder<T, TContribution, true>

/**
 * An immutable builder for a composed object param, produced by `queryParam.object`.
 *
 * @typeParam TChildren - The child param map.
 * @typeParam THasOwnDefault - `true` once `withDefault` supplied an own contribution.
 * @typeParam TGated - `true` once `withDefaultsWhenPresent` conditioned every default on presence.
 */
export interface QueryParamObjectBuilder<
  TChildren extends AnyObjectChildren,
  THasOwnDefault extends boolean = false,
  TGated extends boolean = false,
> extends DefinedQueryParam<
    ObjectExplicitValue<TChildren>,
    ObjectResolvedValue<TChildren>,
    ObjectContribution<TChildren>,
    ObjectGuaranteed<TChildren, THasOwnDefault, TGated>
  > {
  /** Type-only carrier of the declared children, used for logical path inference. */
  readonly [paramChildren]?: TChildren
  /**
   * Sets an own contribution above the children's defaults. Repeating it replaces
   * the previous own contribution.
   *
   * @returns A new builder with this contribution.
   */
  withDefault: (defaultValue: ObjectContribution<TChildren>) => QueryParamObjectBuilder<TChildren, true, TGated>
  /**
   * Sets the equality function for defined explicit objects.
   *
   * @returns A new builder using `eq`.
   */
  withEquality: (
    eq: (a: ObjectExplicitValue<TChildren>, b: ObjectExplicitValue<TChildren>) => boolean,
  ) => QueryParamObjectBuilder<TChildren, THasOwnDefault, TGated>
  /**
   * Keeps a default-valued write in the URL: param-level `clearOnDefault: false`.
   *
   * @returns A new builder that retains default-valued writes.
   */
  keepOnDefault: () => QueryParamObjectBuilder<TChildren, THasOwnDefault, TGated>
  /**
   * Conditions every default of the object on decoded explicit presence, in any
   * modifier order.
   *
   * @returns A new builder whose defaults apply only to a present object.
   */
  withDefaultsWhenPresent: () => QueryParamObjectBuilder<TChildren, THasOwnDefault, true>
  /**
   * Maps the resolved object to a different public shape.
   *
   * @returns A new builder for the transformed value.
   */
  transform: <TOutput>(
    transformer: QueryParamTransform<ObjectResolvedValue<TChildren>, TOutput, ObjectExplicitValue<TChildren>>,
  ) => QueryParamBuilder<TOutput>
}

/**
 * The object builder type for a given child map.
 *
 * @internal
 */
export type QueryParamObjectBuilderFor<TChildren extends AnyObjectChildren> = QueryParamObjectBuilder<TChildren>

/**
 * The concrete builder type retained when a param's query paths are prefixed.
 *
 * @typeParam TParam - The param being prefixed.
 */
export type PrefixedQueryParamBuilder<TParam extends AnyDefinedQueryParam> = TParam

/**
 * The raw executable pieces a builder wraps.
 *
 * @internal
 */
export interface QueryParamBuilderOptions<T> {
  paths: readonly string[]
  read: (query: ParsedQuery, context?: QueryParamReadContext) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean
  resolve?: (explicitValue: T | undefined, defaultValue: T | undefined) => T | undefined
  defaultValue?: unknown
  clearOnDefault?: boolean
  presenceGated?: boolean
  structure?: ParamStructure
}
