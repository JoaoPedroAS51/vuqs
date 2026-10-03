import type { ParsedQueryValue } from '../query/types'
import { structuralEq } from '../../shared/utils/object'

export function isCodec<T>(value: unknown): value is Codec<T> {
  return value !== undefined
    && typeof (value as Codec<T>).parse === 'function'
    && typeof (value as Codec<T>).serialize === 'function'
}

/**
 * A bidirectional, path-agnostic converter between a query value and a typed value.
 *
 * @remarks
 * A codec pairs `parse` with `serialize` as one unit so the two cannot drift
 * apart. It is unaware of where in the query the value lives: {@link queryParam}
 * binds a codec to a concrete path.
 *
 * @typeParam T - The decoded value type the codec reads and writes.
 */
export interface Codec<T> {
  /** Decodes a typed value from a query node, or `undefined` when the node is absent or invalid. */
  parse: (raw: ParsedQueryValue) => T | undefined
  /** Encodes a typed value back into a query node. */
  serialize: (value: T) => ParsedQueryValue
  /** Compares two values to detect when one equals the default. Defaults to {@link structuralEq}. */
  eq: (a: T, b: T) => boolean
  /** The fallback value, present only on codecs produced by {@link Codec.withDefault}. */
  readonly defaultValue?: T
  /** Returns a variant carrying `defaultValue`, which the param layer applies when the value is absent. */
  withDefault: (defaultValue: T) => CodecWithDefault<T>
  /**
   * Returns a variant that serializes `null` as absence.
   *
   * @remarks
   * Parsing stays unchanged. Non-null values use the original serialization and
   * equality. Two null values are equal; null and a non-null value are unequal.
   * The default is preserved without adding one.
   *
   * @returns A codec accepting `T | null`.
   *
   * @example
   * ```ts
   * const state = codecs.string.nullable().withDefault(null)
   * state.serialize(null) // undefined
   * ```
   */
  nullable: () => Codec<T | null>
}

/**
 * A {@link Codec} carrying a static default value.
 *
 * @remarks
 * `parse` stays raw: it returns `undefined` when the query node is absent or
 * invalid, exactly like the base codec. The default is resolved one layer up, by
 * the param that binds the codec, so it is applied once rather than baked into
 * `parse`. `defaultValue` is exposed so a consumer can omit the value from its
 * output when it equals the default.
 *
 * @typeParam T - The decoded value type.
 */
export interface CodecWithDefault<T> extends Codec<T> {
  readonly defaultValue: T
  /** Returns a nullable variant carrying the same default. */
  nullable: () => CodecWithDefault<T | null>
}

/**
 * The parse/serialize pair passed to {@link createCodec}.
 *
 * @remarks
 * `eq` is optional and defaults to {@link structuralEq}.
 */
export interface CodecInput<T> {
  /** Decodes a typed value from a query node, or `undefined` when absent or invalid. */
  parse: (raw: ParsedQueryValue) => T | undefined
  /** Encodes a typed value back into a query node. */
  serialize: (value: T) => ParsedQueryValue
  /** Optional equality, defaulting to {@link structuralEq}. */
  eq?: (a: T, b: T) => boolean
}

/**
 * Creates a codec from a parse/serialize pair.
 *
 * @remarks
 * Use this factory to adapt an external state shape, for example a table library's
 * sorting or pagination state, to a query value. When `eq` is omitted it defaults
 * to {@link structuralEq}.
 *
 * @typeParam T - The decoded value type.
 * @param input - The parse, serialize, and optional equality functions.
 * @returns A codec with `withDefault` and `nullable` modifiers.
 *
 * @example
 * ```ts
 * const sorting = createCodec<SortingState>({
 *   parse: raw => decodeSorting(getQueryString(raw)),
 *   serialize: value => encodeSorting(value),
 * })
 * ```
 */
export function createCodec<T>(input: CodecInput<T>): Codec<T> {
  const eq = input.eq ?? structuralEq

  const codec: Codec<T> = {
    parse: input.parse,
    serialize: input.serialize,
    eq,
    withDefault(defaultValue) {
      return {
        ...codec,
        defaultValue,
        nullable: () => codec.nullable().withDefault(defaultValue),
      }
    },
    nullable() {
      return createCodec<T | null>({
        parse: codec.parse,
        serialize: value => value === null ? undefined : codec.serialize(value),
        eq: (a, b) => a === null || b === null ? a === b : codec.eq(a, b),
      })
    },
  }

  return codec
}
