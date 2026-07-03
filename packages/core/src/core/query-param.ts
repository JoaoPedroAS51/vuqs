import type { Codec, CodecWithDefault } from './codec'
import type { QueryParamObjectFactory } from './query-param-object'
import type { QueryParamOptions } from './query-param-scalar'
import type {
  QueryParamBuilder,
  QueryParamBuilderWithDefault,
} from './query-param-types'
import { createObjectQueryParamFromArgs } from './query-param-object'
import { createScalarQueryParam, createStringQueryParam, isCodec } from './query-param-scalar'

interface QueryParamFactory {
  (path: string): QueryParamBuilder<string>
  (path: string, options: { defaultValue: string }): QueryParamBuilderWithDefault<string>
  <T>(path: string, codec: CodecWithDefault<T>): QueryParamBuilderWithDefault<T>
  <T>(path: string, codec: Codec<T>): QueryParamBuilder<T>
  object: QueryParamObjectFactory
}

function queryParamFactory<T>(
  path: string,
  codecOrOptions?: Codec<T> | QueryParamOptions<string>,
): QueryParamBuilder<string> | QueryParamBuilderWithDefault<string> | QueryParamBuilder<T> | QueryParamBuilderWithDefault<T> {
  return isCodec(codecOrOptions)
    ? createScalarQueryParam(path, codecOrOptions)
    : createStringQueryParam(path, codecOrOptions)
}

export const queryParam = Object.assign(queryParamFactory, {
  object: createObjectQueryParamFromArgs,
}) as QueryParamFactory

export type {
  PrefixedQueryParamBuilder,
  QueryParamBuilder,
  QueryParamBuilderWithDefault,
  QueryParamObjectBuilder,
  QueryParamObjectBuilderWithDefault,
  QueryParamTransform,
} from './query-param-types'

export type QueryParam<T> = QueryParamBuilder<T>
export type QueryParamWithDefault<T> = QueryParamBuilderWithDefault<T>
