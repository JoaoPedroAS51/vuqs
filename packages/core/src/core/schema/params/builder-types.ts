import type { ParsedQuery, ParsedQueryRaw } from '../../query/types'
import type { DefinedQueryParam, DefinedQueryParamWithDefault, QueryParamReadContext } from './definition'

/** @internal */
export type Simplify<T> = { [Key in keyof T]: T[Key] } & {}

/** @internal */
export type AnyDefinedQueryParam = DefinedQueryParam<any>

/** @internal */
export type AnyObjectChildren = Record<string, AnyDefinedQueryParam>

/** @internal */
export type DefinedValue<TParam> = TParam extends DefinedQueryParam<infer TValue> ? TValue : never

type RequiredObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? Key : never]: DefinedValue<TChildren[Key]>
}

type OptionalObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? never : Key]?: DefinedValue<TChildren[Key]>
}

/**
 * The value type of an object param, built from its children.
 *
 * @typeParam TChildren - The child param map.
 */
export type ObjectValue<TChildren extends AnyObjectChildren> = Simplify<
  RequiredObjectChildren<TChildren> & OptionalObjectChildren<TChildren>
>

/** @internal */
export type HasDefaultedChildren<TChildren extends AnyObjectChildren>
  = keyof RequiredObjectChildren<TChildren> extends never ? false : true

/**
 * The accepted default for a param: a partial fill for object values, the value
 * itself otherwise.
 *
 * @typeParam TValue - The param's value type.
 */
export type QueryParamObjectDefault<TValue> = TValue extends object ? Partial<TValue> : TValue

/**
 * The read/write mapping passed to {@link QueryParamBuilder.transform}.
 *
 * @typeParam TInput - The source value type.
 * @typeParam TOutput - The public value type.
 */
export interface QueryParamTransform<TInput, TOutput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TInput
  eq?: (a: TOutput, b: TOutput) => boolean
}

/**
 * A param definition with chainable modifiers.
 *
 * @typeParam T - The param's value type.
 * @typeParam TDefaultInput - The type accepted by `withDefault`.
 */
export interface QueryParamBuilder<T, TDefaultInput = T> extends DefinedQueryParam<T> {
  /** Sets the param's default, layered over the codec default. */
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  /** Sets how the value is compared, which drives `clearOnDefault`. */
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TDefaultInput>
  /** Keeps a default-valued write in the URL: param-level `clearOnDefault: false`. */
  keepOnDefault: () => QueryParamBuilder<T, TDefaultInput>
  /**
   * Maps the param to a different public shape, deriving its default and equality
   * from the source unless overridden.
   */
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

/**
 * A {@link QueryParamBuilder} whose definition carries a default.
 *
 * @typeParam T - The param's value type.
 * @typeParam TDefaultInput - The type accepted by `withDefault`.
 */
export interface QueryParamBuilderWithDefault<T, TDefaultInput = T>
  extends DefinedQueryParamWithDefault<T> {
  /** Replaces the current default. */
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  /** Sets how the value is compared, which drives `clearOnDefault`. */
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilderWithDefault<T, TDefaultInput>
  /** Keeps a default-valued write in the URL: param-level `clearOnDefault: false`. */
  keepOnDefault: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  /**
   * Maps the param to a different public shape, deriving its default and equality
   * from the source unless overridden.
   */
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

/**
 * A builder for a composed object param, produced by `queryParam.object`.
 *
 * @typeParam T - The object value type.
 * @typeParam TDefaultInput - The type accepted by `withDefault`, a partial fill.
 */
export interface QueryParamObjectBuilder<T, TDefaultInput = QueryParamObjectDefault<T>>
  extends DefinedQueryParam<T> {
  /** Sets a partial object default, layered under the child defaults. */
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput>
  /** Sets how the object value is compared, which drives `clearOnDefault`. */
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilder<T, TDefaultInput>
  /** Keeps a default-valued write in the URL: param-level `clearOnDefault: false`. */
  keepOnDefault: () => QueryParamObjectBuilder<T, TDefaultInput>
  /** Applies child defaults only when the object is present in the URL or carries its own default. */
  withDefaultsWhenPresent: () => QueryParamObjectBuilder<T, TDefaultInput>
  /** Maps the object to a different public shape, deriving its default and equality from the source unless overridden. */
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

/**
 * A {@link QueryParamObjectBuilder} whose resolved value carries a default.
 *
 * @typeParam T - The object value type.
 * @typeParam TDefaultInput - The type accepted by `withDefault`, a partial fill.
 * @typeParam THasOwnDefault - `true` when an object-level `withDefault` set the
 * default, `false` when only child defaults did.
 */
export interface QueryParamObjectBuilderWithDefault<
  T,
  TDefaultInput = QueryParamObjectDefault<T>,
  THasOwnDefault extends boolean = true,
> extends DefinedQueryParamWithDefault<T> {
  /** Sets a partial object default, marking the object as owning its default. */
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput, true>
  /** Sets how the object value is compared, which drives `clearOnDefault`. */
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilderWithDefault<T, TDefaultInput, THasOwnDefault>
  /** Keeps a default-valued write in the URL: param-level `clearOnDefault: false`. */
  keepOnDefault: () => QueryParamObjectBuilderWithDefault<T, TDefaultInput, THasOwnDefault>
  /** Applies child defaults only on presence; stays defaulted only if an object-level default was set. */
  withDefaultsWhenPresent: () => THasOwnDefault extends true
    ? QueryParamObjectBuilderWithDefault<T, TDefaultInput, true>
    : QueryParamObjectBuilder<T, TDefaultInput>
  /** Maps the object to a different public shape, deriving its default and equality from the source unless overridden. */
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

/**
 * The object builder type for a given child map: defaulted when any child is,
 * plain otherwise.
 *
 * @internal
 */
export type QueryParamObjectBuilderFor<TChildren extends AnyObjectChildren>
  = HasDefaultedChildren<TChildren> extends true
    ? QueryParamObjectBuilderWithDefault<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>, false>
    : QueryParamObjectBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>

/**
 * The builder type produced by prefixing an existing param, preserving the source
 * builder's kind and default state.
 *
 * @typeParam TParam - The param being prefixed.
 */
export type PrefixedQueryParamBuilder<TParam extends AnyDefinedQueryParam>
  = TParam extends QueryParamObjectBuilderWithDefault<infer TValue, infer TDefaultInput, infer THasOwnDefault extends boolean>
    ? QueryParamObjectBuilderWithDefault<TValue, TDefaultInput, THasOwnDefault>
    : TParam extends QueryParamObjectBuilder<infer TValue, infer TDefaultInput>
      ? QueryParamObjectBuilder<TValue, TDefaultInput>
      : TParam extends QueryParamBuilderWithDefault<infer TValue, infer TDefaultInput>
        ? QueryParamBuilderWithDefault<TValue, TDefaultInput>
        : TParam extends QueryParamBuilder<infer TValue, infer TDefaultInput>
          ? QueryParamBuilder<TValue, TDefaultInput>
          : TParam extends DefinedQueryParamWithDefault<infer TValue>
            ? QueryParamBuilderWithDefault<TValue>
            : QueryParamBuilder<DefinedValue<TParam>>

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
  resolve?: (selection: T, defaults: T | undefined) => T
  defaultValue?: T
  clearOnDefault?: boolean
  presenceGated?: boolean
}
