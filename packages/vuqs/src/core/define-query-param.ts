import type { Codec, CodecWithDefault } from './codec'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { structuralEq } from './equality'
import { collectLeafPaths, getPath, setPath } from './path'

/**
 * A param's wiring: the query path(s) it owns and how it reads and writes them.
 *
 * @remarks
 * This is the Layer 1 primitive and carries no context policy such as preserve
 * or validity handling. `paths` is the source of truth for the keys the param
 * manages, so removal can target only this param's keys while preserving siblings.
 *
 * @typeParam T - The decoded value type of the param.
 */
export interface QueryParamDefinition<T> {
  /** The query keys this param owns. */
  readonly paths: readonly string[]
  /** Reads the param's value from the parsed query, or `undefined` when absent. */
  parse: (query: ParsedQuery) => T | undefined
  /** Writes the param's value into a fresh query object covering only `paths`. */
  serialize: (value: T) => ParsedQueryRaw
  /** Compares two values to detect when one equals the default. */
  eq: (a: T, b: T) => boolean
  /** The param's default value, if the underlying codec or definition declared one. */
  readonly defaultValue?: T
}

/**
 * A {@link QueryParamDefinition} whose codec declared a default, so its value is
 * never absent: a missing key reads back as {@link QueryParamDefinition.defaultValue}.
 *
 * @remarks
 * Carrying this as a distinct type lets {@link useQueryStates} narrow a defaulted
 * param to `T` instead of `T | undefined`, matching the single-param overload.
 *
 * @typeParam T - The decoded value type of the param.
 */
export interface QueryParamDefinitionWithDefault<T> extends QueryParamDefinition<T> {
  readonly defaultValue: T
}

/**
 * The escape-hatch form passed to {@link defineQueryParam} for params that span
 * multiple keys or need custom parse/serialize.
 *
 * @remarks
 * `paths` must list every key `serialize` writes. A dev guard checks this on the
 * first serialize and throws on a mismatch.
 */
export interface QueryParamDefinitionInput<T> {
  /** Every query key the param manages. `serialize` must not write outside this list. */
  paths: readonly string[]
  /** Reads the param's value from the parsed query, or `undefined` when absent. */
  parse: (query: ParsedQuery) => T | undefined
  /** Writes the param's value as a query object covering only `paths`. */
  serialize: (value: T) => ParsedQueryRaw
  /** Optional equality, defaulting to {@link structuralEq}. */
  eq?: (a: T, b: T) => boolean
  /** Optional default value, surfaced as {@link QueryParamDefinition.defaultValue}. */
  default?: T
}

/**
 * Binds a codec with a static default to a single dot-path.
 *
 * @remarks
 * `paths` is derived from `path`. The codec's default is surfaced as
 * {@link QueryParamDefinition.defaultValue}, and the result is a
 * {@link QueryParamDefinitionWithDefault}, so a missing key reads back as that
 * default instead of `undefined`.
 *
 * @typeParam T - The decoded value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - A codec carrying a default, from {@link Codec.withDefault}.
 * @returns A definition that manages the single key at `path` and never reads absent.
 *
 * @example
 * ```ts
 * defineQueryParam('page', codecs.integer.withDefault(1))
 * ```
 */
export function defineQueryParam<T>(path: string, codec: CodecWithDefault<T>): QueryParamDefinitionWithDefault<T>
/**
 * Binds a codec to a single dot-path.
 *
 * @remarks
 * `paths` is derived from `path`, so there is nothing to keep in sync by hand.
 *
 * @typeParam T - The decoded value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - The codec that reads and writes the value at `path`.
 * @returns A definition that manages the single key at `path`.
 *
 * @example
 * ```ts
 * defineQueryParam('currency', codecs.string)
 * defineQueryParam('filters.sort', codecs.string)
 * ```
 */
export function defineQueryParam<T>(path: string, codec: Codec<T>): QueryParamDefinition<T>
/**
 * Defines a composite or custom param spanning one or more keys.
 *
 * @remarks
 * `paths` is the source of truth for the keys the param manages. The returned
 * `serialize` throws on its first call if it writes a key outside `paths`.
 *
 * @typeParam T - The decoded value type.
 * @param definition - The paths, parse, serialize, and optional equality and default.
 * @returns A definition that manages the declared `paths`.
 *
 * @example
 * ```ts
 * defineQueryParam({
 *   paths: ['from', 'to'],
 *   parse: q => buildRange(q),
 *   serialize: v => ({ from: v.from, to: v.to }),
 * })
 * ```
 */
export function defineQueryParam<T>(definition: QueryParamDefinitionInput<T>): QueryParamDefinition<T>
export function defineQueryParam<T>(
  pathOrDefinition: string | QueryParamDefinitionInput<T>,
  codec?: Codec<T>,
): QueryParamDefinition<T> {
  if (typeof pathOrDefinition === 'string') {
    const path = pathOrDefinition
    const boundCodec = codec as Codec<T>

    return {
      paths: [path],
      parse: query => boundCodec.parse(getPath(query, path)),
      serialize: guardSerialize([path], value => setPath({}, path, boundCodec.serialize(value))),
      eq: boundCodec.eq,
      defaultValue: boundCodec.defaultValue,
    }
  }

  const definition = pathOrDefinition

  return {
    paths: definition.paths,
    parse: definition.parse,
    serialize: guardSerialize(definition.paths, definition.serialize),
    eq: definition.eq ?? structuralEq,
    defaultValue: definition.default,
  }
}

/**
 * Wraps a serialize function so every call checks that the keys it writes fall
 * within the declared paths.
 *
 * @remarks
 * A mismatch means a later removal would leak or miss keys, so it throws instead
 * of silently corrupting the query. The check walks a small object, so the cost
 * is negligible.
 *
 * @throws {Error} When the wrapped `serialize` writes a key outside `paths`.
 *
 * @internal
 */
function guardSerialize<T>(
  paths: readonly string[],
  serialize: (value: T) => ParsedQueryRaw,
): (value: T) => ParsedQueryRaw {
  const declared = new Set(paths)

  return (value) => {
    const output = serialize(value)

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
