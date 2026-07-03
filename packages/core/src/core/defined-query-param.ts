import type { Codec } from './codec'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { structuralClone, structuralEq } from './equality'
import { collectLeafPaths, getPath, setPath } from './path'

/**
 * A defined query param the core can execute.
 *
 * @remarks
 * Builders and codecs normalize to this shape before they reach the engine,
 * serializer, or schema helpers. `paths` is the source of truth for the query
 * keys the param owns.
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
  const read = withDefaultFallback(input.read, input.defaultValue)

  return {
    paths: input.paths,
    read,
    write,
    eq: input.eq ?? structuralEq,
    defaultValue: input.defaultValue,
    clearOnDefault: input.clearOnDefault,
  }
}

/**
 * The raw executable pieces of a codec bound to a single dot-path.
 *
 * @remarks
 * `read` stays raw (`undefined` when absent), so both the plain param and the
 * builder resolve the codec default through the single default layer.
 *
 * @internal
 */
export function codecParamInput<T>(path: string, codec: Codec<T>): {
  paths: readonly string[]
  read: (query: ParsedQuery) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  defaultValue?: T
} {
  return {
    paths: [path],
    read: query => codec.parse(getPath(query, path)),
    write: value => setPath({}, path, codec.serialize(value)),
    eq: codec.eq,
    defaultValue: codec.defaultValue,
  }
}

/**
 * Binds a codec to a single dot-path.
 *
 * @internal
 */
export function defineCodecQueryParam<T>(path: string, codec: Codec<T>): DefinedQueryParam<T> {
  return createDefinedQueryParam(codecParamInput(path, codec))
}

/**
 * Wraps a raw read so an absent value resolves to the declared default.
 *
 * @remarks
 * This is the single place a default is applied: the wrapped `read` stays raw
 * (`undefined` when absent), and the default layers on top here. It upholds the
 * {@link DefinedQueryParamWithDefault} contract that a defaulted param never
 * reads back `undefined`, whether the default comes from the codec or a builder
 * modifier. The default is cloned per read so a consumer that mutates the
 * returned value cannot corrupt the shared default, matching how a value decoded
 * from the URL is always a fresh object.
 *
 * @internal
 */
function withDefaultFallback<T>(
  read: (query: ParsedQuery) => T | undefined,
  defaultValue: T | undefined,
): (query: ParsedQuery) => T | undefined {
  if (defaultValue === undefined) {
    return read
  }

  return (query) => {
    const value = read(query)

    return value === undefined ? structuralClone(defaultValue) : value
  }
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
          `[vuqs] write() wrote "${path}", which is not in the declared paths [${paths.join(', ')}].`,
        )
      }
    }

    return output
  }
}
