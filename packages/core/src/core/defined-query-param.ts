import type { Codec } from './codec'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { warn } from './debug/sink'
import { structuralEq } from './equality'
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
  /**
   * Reads the param's URL selection: the decoded value, or `undefined` when it has
   * none. A scalar reads `undefined` for an absent or invalid value; a present
   * object still fills its children's when-present defaults, and its own top-level
   * default is resolved by the engine's default layer.
   */
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
 * @remarks
 * The default drives non-nullable reads at the composable boundary (a defaulted
 * `useQueryState` ref, a defaulted grouped value), but `read` stays a selection:
 * it returns `undefined` for an absent or invalid value. The default is resolved
 * by the engine's default layer, not by `read`.
 *
 * @typeParam T - The decoded value type of the param.
 */
export interface DefinedQueryParamWithDefault<T> extends DefinedQueryParam<T> {
  readonly defaultValue: T
}

/**
 * Tells a {@link DefinedQueryParam} from a schema object at runtime: a param owns
 * a `paths` array, a schema (a map of params) does not.
 *
 * @internal
 */
export function isDefinedQueryParam(value: unknown): value is DefinedQueryParam<unknown> {
  return typeof value === 'object' && value !== null && Array.isArray((value as { paths?: unknown }).paths)
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

  return {
    paths: input.paths,
    read: input.read,
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
 * `read` is a selection: `undefined` when the value is absent or invalid. The
 * default is resolved by the engine's default layer, not here.
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
  // Dedupe per path so a persistent bad value cannot warn on every recompute:
  // the `read` runs inside a reactive computed. Refreshed when `raw` changes.
  let lastWarnedRaw: unknown

  return {
    paths: [path],
    read: (query) => {
      const raw = getPath(query, path)
      const parsed = codec.parse(raw)

      if (raw !== undefined && raw !== null && parsed === undefined) {
        if (raw !== lastWarnedRaw) {
          lastWarnedRaw = raw
          warn('engine:parse-miss', path, raw)
        }
      }
      else {
        lastWarnedRaw = raw
      }

      return parsed
    },
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
