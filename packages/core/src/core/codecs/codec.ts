import type { ParsedQueryValue } from '../query/types'
import { structuralEq } from '../../shared/utils/object'

/** @internal */
export function isCodec<T>(value: unknown): value is Codec<T> {
  return value !== undefined
    && typeof (value as Codec<T>).parse === 'function'
    && typeof (value as Codec<T>).serialize === 'function'
}

/**
 * A bidirectional, path-agnostic converter between a query value and a typed value.
 *
 * @typeParam T - The decoded value type the codec reads and writes.
 */
export interface Codec<T> {
  /**
   * Decodes a query node.
   *
   * @returns The decoded value, or `undefined` when absent or invalid.
   */
  parse: (raw: ParsedQueryValue) => T | undefined
  /**
   * Encodes a typed value for the query.
   *
   * @returns The encoded query value, or `undefined` to omit it.
   */
  serialize: (value: T) => ParsedQueryValue
  /** Compares two values to detect when one equals the default. Defaults to {@link structuralEq}. */
  eq: (a: T, b: T) => boolean
  /** The fallback value, present only on codecs produced by {@link Codec.withDefault}. */
  readonly defaultValue?: T
  /**
   * Adds a default for absent values.
   *
   * @returns A codec variant carrying `defaultValue`.
   */
  withDefault: (defaultValue: T) => CodecWithDefault<T>
  /**
   * Allows `null` values.
   *
   * @returns A codec variant that serializes `null` as absence.
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
 * @typeParam T - The decoded value type.
 */
export interface CodecWithDefault<T> extends Codec<T> {
  readonly defaultValue: T
  /**
   * Allows `null` values.
   *
   * @returns A nullable codec variant preserving the current default.
   */
  nullable: () => CodecWithDefault<T | null>
}

/**
 * The parse/serialize pair passed to {@link createCodec}.
 */
export interface CodecInput<T> {
  /**
   * Decodes a query node.
   *
   * @returns The decoded value, or `undefined` when absent or invalid.
   */
  parse: (raw: ParsedQueryValue) => T | undefined
  /**
   * Encodes a typed value for the query.
   *
   * @returns The encoded query value, or `undefined` to omit it.
   */
  serialize: (value: T) => ParsedQueryValue
  /** Optional equality, defaulting to {@link structuralEq}. */
  eq?: (a: T, b: T) => boolean
}

/**
 * Creates a codec from a parse/serialize pair.
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
 *
 * @see https://vuqs.dev/guide/codecs/custom
 */
export function createCodec<T>(input: CodecInput<T>): Codec<T> {
  const codec: Codec<T> = {
    parse: input.parse,
    serialize: input.serialize,
    eq: input.eq ?? structuralEq,
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
