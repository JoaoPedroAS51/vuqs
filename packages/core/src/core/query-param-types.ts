import type { DefinedQueryParam, DefinedQueryParamWithDefault } from './defined-query-param'
import type { ParsedQuery, ParsedQueryRaw } from './types'

export type Simplify<T> = { [Key in keyof T]: T[Key] } & {}
export type AnyDefinedQueryParam = DefinedQueryParam<any>
export type AnyObjectChildren = Record<string, AnyDefinedQueryParam>
export type DefaultInput<T> = T
export type DefinedValue<TParam> = TParam extends DefinedQueryParam<infer TValue> ? TValue : never

type RequiredObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? Key : never]: DefinedValue<TChildren[Key]>
}

type OptionalObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? never : Key]?: DefinedValue<TChildren[Key]>
}

export type ObjectValue<TChildren extends AnyObjectChildren> = Simplify<
  RequiredObjectChildren<TChildren> & OptionalObjectChildren<TChildren>
>

export type HasDefaultedChildren<TChildren extends AnyObjectChildren>
  = keyof RequiredObjectChildren<TChildren> extends never ? false : true

export type QueryParamObjectDefault<TValue> = TValue extends object ? Partial<TValue> : TValue

export interface QueryParamTransform<TInput, TOutput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TInput
  eq?: (a: TOutput, b: TOutput) => boolean
}

export interface QueryParamBuilder<T, TDefaultInput = DefaultInput<T>> extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

export interface QueryParamBuilderWithDefault<T, TDefaultInput = DefaultInput<T>>
  extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilderWithDefault<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

export interface QueryParamObjectBuilder<T, TDefaultInput = QueryParamObjectDefault<T>>
  extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamObjectBuilder<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamObjectBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

/**
 * An object builder whose resolved value carries a default.
 *
 * @remarks
 * `THasOwnDefault` tracks where the default came from. Child defaults alone make
 * the object resolve to a value, but `withDefaultsWhenPresent` gates them on URL
 * presence, so it drops the builder back to {@link QueryParamObjectBuilder}. An
 * object-level `withDefault` keeps the object resolved regardless of presence.
 */
export interface QueryParamObjectBuilderWithDefault<
  T,
  TDefaultInput = QueryParamObjectDefault<T>,
  THasOwnDefault extends boolean = true,
> extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamObjectBuilderWithDefault<T, TDefaultInput, true>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamObjectBuilderWithDefault<T, TDefaultInput, THasOwnDefault>
  keepOnDefault: () => QueryParamObjectBuilderWithDefault<T, TDefaultInput, THasOwnDefault>
  withDefaultsWhenPresent: () => THasOwnDefault extends true
    ? QueryParamObjectBuilderWithDefault<T, TDefaultInput, true>
    : QueryParamObjectBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

export type QueryParamObjectBuilderFor<TChildren extends AnyObjectChildren>
  = HasDefaultedChildren<TChildren> extends true
    ? QueryParamObjectBuilderWithDefault<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>, false>
    : QueryParamObjectBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>

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

export interface QueryParamBuilderOptions<T> {
  paths: readonly string[]
  read: (query: ParsedQuery) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean
  defaultValue?: T
  clearOnDefault?: boolean
}
