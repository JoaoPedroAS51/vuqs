import type { Codec } from './codec'
import type { QueryParamBuilder, QueryParamBuilderWithDefault } from './query-param-types'
import { codecs } from './codec'
import { codecParamInput } from './defined-query-param'
import { createQueryParamBuilder } from './query-param-builder'

export interface QueryParamOptions<T> {
  defaultValue?: T
}

// The read stays raw (codec.parse returns undefined when absent); the default is
// applied once by the builder from `defaultValue`, so `.withDefault` and
// `.transform` compose over the raw read instead of a default-baked one.
export function createScalarQueryParam<T>(
  path: string,
  codec: Codec<T>,
): QueryParamBuilder<T> | QueryParamBuilderWithDefault<T> {
  return createQueryParamBuilder(codecParamInput(path, codec))
}

export function createStringQueryParam(
  path: string,
  options?: QueryParamOptions<string>,
): QueryParamBuilder<string> | QueryParamBuilderWithDefault<string> {
  const codec = options?.defaultValue === undefined
    ? codecs.string
    : codecs.string.withDefault(options.defaultValue)

  return createScalarQueryParam(path, codec)
}

export function isCodec<T>(value: Codec<T> | QueryParamOptions<string> | undefined): value is Codec<T> {
  return value !== undefined
    && typeof (value as Codec<T>).parse === 'function'
    && typeof (value as Codec<T>).serialize === 'function'
}
