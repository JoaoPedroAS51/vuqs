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

export type QueryParamObjectDefault<TValue> = TValue extends object ? Partial<TValue> : TValue

export interface QueryParamTransform<TInput, TOutput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TInput
  eq?: (a: TOutput, b: TOutput) => boolean
}

export interface QueryParamBuilder<T, TDefaultInput = DefaultInput<T>> extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

export interface QueryParamBuilderWithDefault<T, TDefaultInput = DefaultInput<T>>
  extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

export interface QueryParamBuilderOptions<T> {
  paths: readonly string[]
  read: (query: ParsedQuery) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean
  defaultValue?: T
  clearOnDefault?: boolean
}
