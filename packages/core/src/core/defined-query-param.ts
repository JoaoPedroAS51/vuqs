import type { Codec, CodecWithDefault } from './codec'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { structuralEq } from './equality'
import { collectLeafPaths, getPath, setPath } from './path'

/**
 * A defined query param the core can execute.
 *
 * @remarks
 * Builders, codecs, and legacy definitions normalize to this shape before they
 * reach the engine, serializer, or schema helpers. `paths` is the source of
 * truth for the query keys the param owns.
 *
 * `parse` and `serialize` are compatibility aliases for the legacy
 * `defineQueryParam` API.
 *
 * @typeParam T - The decoded value type of the param.
 */
export interface DefinedQueryParam<T> {
  /** The query keys this param owns. */
  readonly paths: readonly string[]
  /** Reads the param's value from the parsed query, or `undefined` when absent. */
  read: (query: ParsedQuery) => T | undefined
  /** Writes the param's value into a fresh query object covering only `paths`. */
  write: (value: T) => ParsedQueryRaw
  /** Legacy alias for {@link DefinedQueryParam.read}. */
  parse: (query: ParsedQuery) => T | undefined
  /** Legacy alias for {@link DefinedQueryParam.write}. */
  serialize: (value: T) => ParsedQueryRaw
  /** Compares two values to detect when one equals the default. */
  eq: (a: T, b: T) => boolean
  /** The param's default value, if the codec or builder declared one. */
  readonly defaultValue?: T
  /** Param-level `clearOnDefault` override. */
  readonly clearOnDefault?: boolean
}

/**
 * A {@link DefinedQueryParam} whose definition declares a default.
 *
 * @typeParam T - The decoded value type of the param.
 */
export interface DefinedQueryParamWithDefault<T> extends DefinedQueryParam<T> {
  readonly defaultValue: T
  read: (query: ParsedQuery) => T
  parse: (query: ParsedQuery) => T
}

/**
 * The legacy escape-hatch form accepted by {@link defineQueryParam}.
 *
 * @typeParam T - The decoded value type.
 */
export interface DefinedQueryParamInput<T> {
  /** Every query key the param manages. `serialize` must not write outside this list. */
  paths: readonly string[]
  /** Reads the param's value from the parsed query, or `undefined` when absent. */
  parse: (query: ParsedQuery) => T | undefined
  /** Writes the param's value as a query object covering only `paths`. */
  serialize: (value: T) => ParsedQueryRaw
  /** Optional equality, defaulting to {@link structuralEq}. */
  eq?: (a: T, b: T) => boolean
  /** Optional default value, surfaced as {@link DefinedQueryParam.defaultValue}. */
  default?: T
}

/**
 * Creates a defined param from executable pieces.
 *
 * @internal
 */
export function createDefinedQueryParam<T>(
  input: {
    paths: readonly string[]
    read: (query: ParsedQuery) => T | undefined
    write: (value: T) => ParsedQueryRaw
    eq?: (a: T, b: T) => boolean
    defaultValue?: T
    clearOnDefault?: boolean
  },
): DefinedQueryParam<T> {
  const write = guardWrite(input.paths, input.write)
  const read = input.read

  return {
    paths: input.paths,
    read,
    write,
    parse: read,
    serialize: write,
    eq: input.eq ?? structuralEq,
    defaultValue: input.defaultValue,
    clearOnDefault: input.clearOnDefault,
  }
}

/**
 * Binds a codec to a single dot-path.
 *
 * @internal
 */
export function defineCodecQueryParam<T>(path: string, codec: Codec<T>): DefinedQueryParam<T> {
  return createDefinedQueryParam({
    paths: [path],
    read: query => codec.parse(getPath(query, path)),
    write: value => setPath({}, path, codec.serialize(value)),
    eq: codec.eq,
    defaultValue: codec.defaultValue,
  })
}

/**
 * Binds a defaulted codec to a single dot-path.
 *
 * @internal
 */
export function defineCodecQueryParamWithDefault<T>(
  path: string,
  codec: CodecWithDefault<T>,
): DefinedQueryParamWithDefault<T> {
  return defineCodecQueryParam(path, codec) as DefinedQueryParamWithDefault<T>
}

/**
 * Wraps a write function so every call checks that the keys it writes fall
 * within the declared paths.
 *
 * @throws {Error} When the wrapped write function writes outside `paths`.
 *
 * @internal
 */
export function guardWrite<T>(
  paths: readonly string[],
  write: (value: T) => ParsedQueryRaw,
): (value: T) => ParsedQueryRaw {
  const declared = new Set(paths)

  return (value) => {
    const output = write(value)

    for (const path of collectLeafPaths(output)) {
      if (!declared.has(path)) {
        throw new Error(
          `[vuqs] serialize() wrote "${path}", which is not in the declared paths [${paths.join(', ')}].`,
        )
      }
    }

    return output
  }
}
