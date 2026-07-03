import type { Codec, CodecWithDefault } from './codec'
import type { QueryParamObjectFactory } from './query-param-object'
import type { QueryParamOptions } from './query-param-scalar'
import type {
  QueryParamBuilder,
  QueryParamBuilderWithDefault,
} from './query-param-types'
import { createObjectQueryParamFromArgs } from './query-param-object'
import { createScalarQueryParam, createStringQueryParam, isCodec } from './query-param-scalar'

/**
 * Builds a param from a path and codec, or composes one with `object`.
 *
 * @remarks
 * With no codec the param is a plain string; `{ defaultValue }` is shorthand for
 * `codecs.string.withDefault(...)`. A `CodecWithDefault` yields a defaulted param,
 * whose value reads back as `T` rather than `T | undefined`. The result is a
 * chainable builder that is also a `DefinedQueryParam`, usable directly in
 * `useQueryState`, `useQueryStates`, and `createSerializer`. `object` composes a
 * multi-key param from child params: see {@link QueryParamObjectFactory}.
 */
interface QueryParamFactory {
  /** A plain string param bound to `path`. */
  (path: string): QueryParamBuilder<string>
  /** A string param bound to `path` with a default. */
  (path: string, options: { defaultValue: string }): QueryParamBuilderWithDefault<string>
  /** A defaulted param bound to `path` from a `CodecWithDefault`. */
  <T>(path: string, codec: CodecWithDefault<T>): QueryParamBuilderWithDefault<T>
  /** A param bound to `path` from a codec. */
  <T>(path: string, codec: Codec<T>): QueryParamBuilder<T>
  /** Composes a multi-key param from child params. */
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
