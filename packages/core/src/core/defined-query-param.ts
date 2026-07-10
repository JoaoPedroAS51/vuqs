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
   * Reads the param's URL selection: the decoded value, or `undefined` when the
   * value is absent or invalid. A pure selection, with no default of any kind: a
   * present object returns only its URL-present children. Defaults are resolved by
   * {@link DefinedQueryParam.resolve} in the engine's default layer.
   */
  read: (query: ParsedQuery) => T | undefined
  /** Writes the param's value into a fresh query object covering only `paths`. */
  write: (value: T) => ParsedQueryRaw
  /** Compares two values to detect when one equals the default. */
  eq: (a: T, b: T) => boolean
  /**
   * Composes a **present** selection over its resolved default. Only composite
   * params define it: an object deep-merges per child (`selection` child, else the
   * `defaults` child, else its own child default), so a layered default (for example
   * a runtime default) reaches a missing child of a present object. Absence and
   * scalars are resolved by the engine directly (`selection ?? default`).
   */
  resolve?: (selection: T, defaults: T | undefined) => T
  /** The param's default value, if the codec or builder declared one. */
  readonly defaultValue?: T
  /** Param-level `clearOnDefault` override. */
  readonly clearOnDefault?: boolean
  /**
   * When set, the param resolves to a value only while it is present in the URL: an
   * absent param stays absent even if a default layer (codec or runtime) would
   * otherwise materialize it. Set by `withDefaultsWhenPresent()` without an
   * object-level default.
   */
  readonly presenceGated?: boolean
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
    resolve?: (selection: T, defaults: T | undefined) => T
    defaultValue?: T
    clearOnDefault?: boolean
    presenceGated?: boolean
  },
): DefinedQueryParam<T> {
  const write = guardWrite(input.paths, input.write)

  return {
    paths: input.paths,
    read: input.read,
    write,
    eq: input.eq ?? structuralEq,
    resolve: input.resolve,
    defaultValue: input.defaultValue,
    clearOnDefault: input.clearOnDefault,
    presenceGated: input.presenceGated,
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
