import type { Codec, CodecWithDefault } from '../../codecs/codec'
import type { QueryParamBuilder, QueryParamBuilderWithDefault } from './builder-types'
import type { QueryParamObjectFactory } from './object'
import { codecs } from '../../codecs/catalog'
import { isCodec } from '../../codecs/codec'
import { createQueryParamBuilder } from './builder'
import { codecParamInput } from './definition'
import { createObjectQueryParamFromArgs } from './object'

/**
 * Builds a param from a path and codec, or composes one with `object`.
 *
 * @see https://vuqs.dev/guide/query-state/defining-params
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
  return isCodec<T>(codecOrOptions)
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
} from './builder-types'

interface QueryParamOptions<T> {
  defaultValue?: T
}

// The read stays raw (codec.parse returns undefined when absent); the default is
// applied once by the builder from `defaultValue`, so `.withDefault` and
// `.transform` compose over the raw read instead of a default-baked one.
function createScalarQueryParam<T>(
  path: string,
  codec: Codec<T>,
): QueryParamBuilder<T> | QueryParamBuilderWithDefault<T> {
  return createQueryParamBuilder(codecParamInput(path, codec))
}

function createStringQueryParam(
  path: string,
  options?: QueryParamOptions<string>,
): QueryParamBuilder<string> | QueryParamBuilderWithDefault<string> {
  const codec = options?.defaultValue === undefined
    ? codecs.string
    : codecs.string.withDefault(options.defaultValue)

  return createScalarQueryParam(path, codec)
}
