import type { ParsedQueryValue } from './types'
import { warn } from './debug/sink'
import { structuralEq } from './equality'
import { getQueryString } from './path'

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
 * This is the extension point for adapting an external state shape, for example
 * a table library's sorting or pagination state, to a query value. When `eq` is
 * omitted it defaults to {@link structuralEq}.
 *
 * @typeParam T - The decoded value type.
 * @param input - The parse, serialize, and optional equality functions.
 * @returns A codec, including a `withDefault` factory.
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
      }
    },
  }

  return codec
}

/**
 * Built-in codecs for common value shapes.
 *
 * @remarks
 * `string`, `integer`, `float`, and `boolean` are ready-made codecs. `arrayOf`,
 * `literal`, and `json` are factories that build a codec for a given shape.
 */
export const codecs = {
  /** Reads a non-empty query string. Empty or whitespace-only values parse as absent. */
  string: createCodec<string>({
    parse: raw => getQueryString(raw),
    serialize: value => value,
  }),

  /** Parses a base-10 integer. Non-numeric input parses as absent; serializing truncates toward zero. */
  integer: createCodec<number>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      if (!/^[+-]?\d+$/.test(value)) {
        return undefined
      }

      return Number(value)
    },
    serialize: value => String(Math.trunc(value)),
  }),

  /** Parses a 1-based index from the URL into a 0-based value. Non-integer input parses as absent. */
  index: createCodec<number>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      if (!/^[+-]?\d+$/.test(value)) {
        return undefined
      }

      return Number(value) - 1
    },
    serialize: value => String(value + 1),
  }),

  /** Parses a non-negative hexadecimal integer. Non-hex input parses as absent; serializing pads to even length. */
  hex: createCodec<number>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      if (!/^[0-9a-f]+$/i.test(value)) {
        return undefined
      }

      return Number.parseInt(value, 16)
    },
    serialize: (value) => {
      const hex = value.toString(16)

      return (hex.length & 1 ? '0' : '') + hex
    },
  }),

  /** Parses a floating-point number. Non-numeric input parses as absent. */
  float: createCodec<number>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      const parsed = Number(value)

      return Number.isFinite(parsed) ? parsed : undefined
    },
    serialize: value => String(value),
  }),

  /** Parses the strings `'true'` and `'false'`. Any other value parses as absent. */
  boolean: createCodec<boolean>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === 'true') {
        return true
      }

      if (value === 'false') {
        return false
      }

      return undefined
    },
    serialize: value => (value ? 'true' : 'false'),
  }),

  /** Parses a `Date` from milliseconds since the epoch. Non-integer or invalid input parses as absent. */
  timestamp: createCodec<Date>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      if (!/^[+-]?\d+$/.test(value)) {
        return undefined
      }

      const date = new Date(Number(value))

      return Number.isNaN(date.valueOf()) ? undefined : date
    },
    serialize: value => String(value.valueOf()),
    eq: (a, b) => a.valueOf() === b.valueOf(),
  }),

  /** Parses a `Date` from a full ISO-8601 string. Invalid input parses as absent. */
  isoDateTime: createCodec<Date>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      const date = new Date(value)

      return Number.isNaN(date.valueOf()) ? undefined : date
    },
    serialize: value => value.toISOString(),
    eq: (a, b) => a.valueOf() === b.valueOf(),
  }),

  /** Parses a `Date` from a date-only `YYYY-MM-DD` string at midnight UTC. Invalid input parses as absent. */
  isoDate: createCodec<Date>({
    parse: (raw) => {
      const value = getQueryString(raw)

      if (value === undefined) {
        return undefined
      }

      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return undefined
      }

      const date = new Date(value.slice(0, 10))

      return Number.isNaN(date.valueOf()) ? undefined : date
    },
    serialize: value => value.toISOString().slice(0, 10),
    eq: (a, b) => a.valueOf() === b.valueOf(),
  }),

  /**
   * Builds a codec for an array whose items are each handled by `codec`.
   *
   * @remarks
   * A scalar query value is treated as a single-item array. Items that `codec`
   * rejects are dropped, and an empty result parses as absent (`undefined`).
   * Equality compares element-wise.
   */
  arrayOf<T>(codec: Codec<T>): Codec<T[]> {
    return createCodec<T[]>({
      parse: (raw) => {
        const items = Array.isArray(raw)
          ? raw
          : raw === undefined || raw === null
            ? []
            : [raw]

        const parsed = items
          .map(item => codec.parse(item))
          .filter((item): item is T => item !== undefined)

        return parsed.length ? parsed : undefined
      },
      serialize: value => value.map(item => codec.serialize(item)),
      eq: (a, b) => a.length === b.length && a.every((item, index) => codec.eq(item, b[index])),
    })
  },

  /**
   * Builds a codec for a string constrained to one of `values`.
   *
   * @remarks
   * Any value outside `values` parses as absent (`undefined`).
   */
  literal<const T extends string>(values: readonly T[]): Codec<T> {
    const allowed = new Set<string>(values)

    return createCodec<T>({
      parse: (raw) => {
        const value = getQueryString(raw)

        return value !== undefined && allowed.has(value) ? (value as T) : undefined
      },
      serialize: value => value,
    })
  },

  /**
   * Builds a codec for a number constrained to one of `values`.
   *
   * @remarks
   * Any value outside `values` parses as absent (`undefined`).
   */
  numberLiteral<const T extends number>(values: readonly T[]): Codec<T> {
    const allowed = new Set<number>(values)

    return createCodec<T>({
      parse: (raw) => {
        const value = getQueryString(raw)

        if (value === undefined) {
          return undefined
        }

        const parsed = Number(value)

        if (!Number.isFinite(parsed)) {
          return undefined
        }

        return allowed.has(parsed) ? (parsed as T) : undefined
      },
      serialize: value => String(value),
    })
  },

  /**
   * Builds a codec for a JSON-encoded query value.
   *
   * @remarks
   * Invalid JSON parses as absent (`undefined`). When `validate` is provided it
   * runs on the parsed value, and a throw is caught and treated as absent, so a
   * schema parser such as Zod's `parse` can act as the validator.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | `JSON.parse`}
   */
  json<T>(options: { validate?: (value: unknown) => T } = {}): Codec<T> {
    // Dedupe per value so a persistent malformed value cannot warn on every
    // recompute: `parse` runs inside the engine's reactive computeds.
    let lastWarnedValue: string | undefined

    return createCodec<T>({
      parse: (raw) => {
        const value = getQueryString(raw)

        if (value === undefined) {
          return undefined
        }

        try {
          const parsed = JSON.parse(value) as unknown

          lastWarnedValue = value

          return options.validate ? options.validate(parsed) : (parsed as T)
        }
        catch (error) {
          if (value !== lastWarnedValue) {
            lastWarnedValue = value
            warn('codec:json-error', value, error)
          }

          return undefined
        }
      },
      serialize: value => JSON.stringify(value),
    })
  },
}
