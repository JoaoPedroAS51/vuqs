import type { ParsedQueryValue } from './types'
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
 * Use this factory to adapt an external state shape, for example a table library's
 * sorting or pagination state, to a query value. When `eq` is omitted it defaults
 * to {@link structuralEq}.
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

const INTEGER_PATTERN = /^[+-]?\d+$/
const HEX_PATTERN = /^[0-9a-f]+$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/

type QueryScalar = string | number | boolean

function fromQueryScalar<T>(decode: (value: QueryScalar) => T | undefined): (raw: ParsedQueryValue) => T | undefined {
  return (raw) => {
    const value = Array.isArray(raw) ? raw[0] : raw

    if (value === null || value === undefined || typeof value === 'object') {
      return undefined
    }

    return decode(value)
  }
}

function fromQueryString<T>(decode: (text: string) => T | undefined): (raw: ParsedQueryValue) => T | undefined {
  return (raw) => {
    const text = getQueryString(raw)

    return text === undefined ? undefined : decode(text)
  }
}

function parseNumber(value: QueryScalar): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  const text = getQueryString(value)

  if (text === undefined) {
    return undefined
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseInteger(value: QueryScalar): number | undefined {
  if (typeof value === 'string' && !INTEGER_PATTERN.test(value)) {
    return undefined
  }

  const parsed = parseNumber(value)
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined
}

// `structuralEq` reads `Object.keys(date)`, which is always empty, so every
// pair of `Date` values would otherwise compare as equal.
function dateEq(a: Date, b: Date): boolean {
  return a.valueOf() === b.valueOf()
}

// Numeric enums also expose a reverse mapping (value to key) at runtime, so
// filter those entries out and keep only the forward members.
function enumValues(enumObject: Record<string, string | number>): (string | number)[] {
  const values: (string | number)[] = []

  for (const key of Object.keys(enumObject)) {
    if (typeof enumObject[enumObject[key] as string] !== 'number') {
      values.push(enumObject[key])
    }
  }

  return values
}

/**
 * Built-in codecs for common value shapes.
 *
 * @remarks
 * `string`, `integer`, `float`, and `boolean` are ready-made codecs. `arrayOf`,
 * `literal`, `enum`, and `json` are factories that build a codec for a given shape.
 */
export const codecs = {
  /** Reads a non-empty query string. Empty or whitespace-only values parse as absent. */
  string: createCodec<string>({
    parse: raw => getQueryString(raw),
    serialize: value => value,
  }),

  /** Reads an integer from a number or base-10 string. Invalid input parses as absent; serializing truncates toward zero. */
  integer: createCodec<number>({
    parse: fromQueryScalar(parseInteger),
    serialize: value => String(Math.trunc(value)),
  }),

  /** Parses a 1-based index from the URL into a 0-based value. Non-integer input parses as absent. */
  index: createCodec<number>({
    parse: fromQueryScalar((raw) => {
      const value = parseInteger(raw)

      if (value === undefined) {
        return undefined
      }

      return value - 1
    }),
    serialize: value => String(value + 1),
  }),

  /**
   * Parses a non-negative hexadecimal integer, padding serialized values to even length.
   *
   * @remarks
   * Numeric query nodes are interpreted as hexadecimal through their decimal
   * text: `10` and `'10'` both decode to `16`. Invalid input parses as absent.
   */
  hex: createCodec<number>({
    parse: fromQueryScalar((value) => {
      const text = typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : getQueryString(value)

      if (text === undefined || !HEX_PATTERN.test(text)) {
        return undefined
      }

      const parsed = Number.parseInt(text, 16)
      return Number.isFinite(parsed) ? parsed : undefined
    }),
    serialize: (value) => {
      const hex = value.toString(16)

      return hex.length % 2 === 0 ? hex : `0${hex}`
    },
  }),

  /** Reads a finite number from a number or numeric string. Invalid input parses as absent. */
  float: createCodec<number>({
    parse: fromQueryScalar(parseNumber),
    serialize: value => String(value),
  }),

  /** Reads a boolean or the strings `'true'` and `'false'`. Any other value parses as absent. */
  boolean: createCodec<boolean>({
    parse: fromQueryScalar((value) => {
      if (typeof value === 'boolean') {
        return value
      }

      if (value === 'true') {
        return true
      }

      if (value === 'false') {
        return false
      }

      return undefined
    }),
    serialize: value => (value ? 'true' : 'false'),
  }),

  /** Parses a `Date` from milliseconds since the epoch. Non-integer or invalid input parses as absent. */
  timestamp: createCodec<Date>({
    parse: fromQueryScalar((raw) => {
      const value = parseInteger(raw)

      if (value === undefined) {
        return undefined
      }

      const date = new Date(value)

      if (Number.isNaN(date.valueOf())) {
        return undefined
      }

      return date
    }),
    serialize: value => String(value.valueOf()),
    eq: dateEq,
  }),

  /** Parses a `Date` from a full ISO-8601 string. Invalid input parses as absent. */
  isoDateTime: createCodec<Date>({
    parse: fromQueryString((text) => {
      const date = new Date(text)

      if (Number.isNaN(date.valueOf())) {
        return undefined
      }

      return date
    }),
    serialize: value => value.toISOString(),
    eq: dateEq,
  }),

  /** Parses a `Date` from a date-only `YYYY-MM-DD` string at midnight UTC. Invalid input parses as absent. */
  isoDate: createCodec<Date>({
    parse: fromQueryString((text) => {
      if (!ISO_DATE_PATTERN.test(text)) {
        return undefined
      }

      const date = new Date(text.slice(0, 10))

      if (Number.isNaN(date.valueOf())) {
        return undefined
      }

      return date
    }),
    serialize: value => value.toISOString().slice(0, 10),
    eq: dateEq,
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
        let items: ParsedQueryValue[]

        if (Array.isArray(raw)) {
          items = raw
        }
        else if (raw === undefined || raw === null) {
          items = []
        }
        else {
          items = [raw]
        }

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
      parse: fromQueryString((text) => {
        if (!allowed.has(text)) {
          return undefined
        }

        return text as T
      }),
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
      parse: fromQueryScalar((value) => {
        const parsed = parseNumber(value)

        if (parsed === undefined || !allowed.has(parsed)) {
          return undefined
        }

        return parsed as T
      }),
      serialize: value => String(value),
    })
  },

  /**
   * Builds a codec for a TypeScript `enum`, accepting any of its members.
   *
   * @remarks
   * Where {@link codecs.literal} takes an explicit array, this reads the accepted
   * values from the enum object itself. It supports string, numeric, and
   * heterogeneous enums, and skips the reverse-mapping entries a numeric enum
   * exposes at runtime, so a numeric member round-trips through its number rather
   * than its key. Any value outside the enum parses as absent (`undefined`).
   *
   * @example
   * ```ts
   * enum Status {
   *   Active = 'active',
   *   Archived = 'archived',
   * }
   *
   * const status = useQueryState('status', codecs.enum(Status))
   * //    ^? QueryStateRef<Status | undefined>
   * ```
   */
  enum<const T extends Record<string, string | number>>(enumObject: T): Codec<T[keyof T]> {
    const byString = new Map<string, T[keyof T]>()
    const byNumber = new Map<number, T[keyof T]>()

    for (const value of enumValues(enumObject)) {
      const member = value as T[keyof T]
      byString.set(String(value), member)

      if (typeof value === 'number') {
        byNumber.set(value, member)
      }
    }

    return createCodec<T[keyof T]>({
      parse: fromQueryScalar((value) => {
        if (typeof value === 'number') {
          return byNumber.get(value)
        }

        const text = getQueryString(value)
        return text === undefined ? undefined : byString.get(text)
      }),
      serialize: value => String(value),
    })
  },

  /**
   * Builds a codec that reads JSON text or an already-parsed query value.
   *
   * @remarks
   * Strings are decoded with `JSON.parse`. Objects and arrays are read as complete
   * values, including empty structures. Nullish query nodes, non-finite numeric
   * nodes, and invalid JSON text parse as absent (`undefined`).
   *
   * When `validate` is provided it receives the decoded or already-parsed value.
   * Its return value is the codec result; a throw is treated as absent. Without
   * `validate`, the value is returned as `T` without schema validation.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | `JSON.parse`}
   */
  json<T>(options: { validate?: (value: unknown) => T } = {}): Codec<T> {
    return createCodec<T>({
      parse: (raw) => {
        if (raw === null || raw === undefined || (typeof raw === 'number' && !Number.isFinite(raw))) {
          return undefined
        }

        try {
          const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw

          return options.validate ? options.validate(parsed) : (parsed as T)
        }
        catch {
          return undefined
        }
      },
      serialize: value => JSON.stringify(value),
    })
  },
}
