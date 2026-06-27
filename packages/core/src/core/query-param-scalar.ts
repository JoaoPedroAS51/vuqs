import type { Codec } from './codec'
import type { QueryParamBuilder, QueryParamBuilderWithDefault } from './query-param-types'
import { codecs } from './codec'
import { defineCodecQueryParam } from './defined-query-param'
import { createQueryParamBuilder } from './query-param-builder'

export interface QueryParamOptions<T> {
  defaultValue?: T
}

export function createScalarQueryParam<T>(
  path: string,
  codec: Codec<T>,
): QueryParamBuilder<T> | QueryParamBuilderWithDefault<T> {
  const defined = defineCodecQueryParam(path, codec)

  return createQueryParamBuilder({
    paths: defined.paths,
    read: defined.read,
    write: defined.write,
    eq: defined.eq,
    defaultValue: defined.defaultValue,
  })
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
