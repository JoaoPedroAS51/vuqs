import type { Codec, CodecWithDefault } from './codec'
import type {
  DefinedQueryParam,
  DefinedQueryParamInput,
  DefinedQueryParamWithDefault,
} from './defined-query-param'
import {
  createDefinedQueryParam,
  defineCodecQueryParam,
  defineCodecQueryParamWithDefault,
} from './defined-query-param'

export type {
  DefinedQueryParam,
  DefinedQueryParamInput,
  DefinedQueryParamWithDefault,
}

/**
 * @deprecated Use {@link DefinedQueryParam}.
 */
export type QueryParamDefinition<T> = DefinedQueryParam<T>

/**
 * @deprecated Use {@link DefinedQueryParamWithDefault}.
 */
export type QueryParamDefinitionWithDefault<T> = DefinedQueryParamWithDefault<T>

/**
 * @deprecated Use `queryParam` for new code.
 */
export type QueryParamDefinitionInput<T> = DefinedQueryParamInput<T>

/**
 * Binds a codec with a static default to a single dot-path.
 *
 * @deprecated Use `queryParam(path, codec)` for new code.
 */
export function defineQueryParam<T>(path: string, codec: CodecWithDefault<T>): DefinedQueryParamWithDefault<T>
/**
 * Binds a codec to a single dot-path.
 *
 * @deprecated Use `queryParam(path, codec)` for new code.
 */
export function defineQueryParam<T>(path: string, codec: Codec<T>): DefinedQueryParam<T>
/**
 * Defines a composite or custom param spanning one or more keys, with a default value.
 *
 * @deprecated Prefer `queryParam.object(...).transform(...)` for new code.
 */
export function defineQueryParam<T>(definition: DefinedQueryParamInput<T> & { default: T }): DefinedQueryParamWithDefault<T>
/**
 * Defines a composite or custom param spanning one or more keys.
 *
 * @deprecated Prefer `queryParam.object(...).transform(...)` for new code.
 */
export function defineQueryParam<T>(definition: DefinedQueryParamInput<T>): DefinedQueryParam<T>
export function defineQueryParam<T>(
  pathOrDefinition: string | DefinedQueryParamInput<T>,
  codec?: Codec<T>,
): DefinedQueryParam<T> {
  if (typeof pathOrDefinition === 'string') {
    if (codec === undefined) {
      throw new Error('[vuqs] defineQueryParam(path, codec) requires a codec.')
    }

    return defineCodecQueryParam(pathOrDefinition, codec)
  }

  return createDefinedQueryParam({
    paths: pathOrDefinition.paths,
    read: pathOrDefinition.parse,
    write: pathOrDefinition.serialize,
    eq: pathOrDefinition.eq,
    defaultValue: pathOrDefinition.default,
  })
}

export { defineCodecQueryParamWithDefault }
