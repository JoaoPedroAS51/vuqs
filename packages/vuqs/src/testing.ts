import type { Codec } from './core/codec'
import type { ParsedQueryValue } from './core/types'
import { structuralEq } from './core/equality'

/**
 * Tests that a codec is bijective: both `parse(serialize(input)) eq input` and
 * `serialize(parse(serialized)) structuralEq serialized` must hold.
 *
 * @remarks
 * Both directions are tested independently via {@link testSerializeThenParse} and
 * {@link testParseThenSerialize}. Additionally, `codec.serialize(input)` must match
 * `serialized`, and `codec.parse(serialized)` must match `input`.
 *
 * Passing tests return `true`; failing tests throw with a message that identifies
 * which side failed and what the mismatch was.
 *
 * @example
 * ```ts
 * import { isCodecBijective } from 'vuqs/testing'
 *
 * // Passing test returns true
 * expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
 * // Failing test throws
 * expect(() => isCodecBijective(codecs.integer, '42', 47)).toThrow()
 * ```
 *
 * @param codec - The codec to test.
 * @param serialized - The expected serialized form of `input`.
 * @param input - The expected parsed form of `serialized`.
 * @returns `true` if all checks pass, otherwise throws.
 */
export function isCodecBijective<T>(codec: Codec<T>, serialized: ParsedQueryValue, input: T): boolean {
  testSerializeThenParse(codec, input)
  testParseThenSerialize(codec, serialized)

  const actualSerialized = codec.serialize(input)
  if (!structuralEq(actualSerialized, serialized)) {
    throw new Error(
      `[vuqs] codec.serialize does not match expected serialized value\n`
      + `  Expected: ${JSON.stringify(serialized)}\n`
      + `  Received: ${JSON.stringify(actualSerialized)}`,
    )
  }

  const parsed = codec.parse(serialized)
  if (parsed === undefined || !codec.eq(parsed, input)) {
    throw new Error(
      `[vuqs] codec.parse does not match expected input value\n`
      + `  Expected: ${JSON.stringify(input)}\n`
      + `  Received: ${JSON.stringify(parsed)}`,
    )
  }

  return true
}

/**
 * Tests the serialize-then-parse direction of a codec: `parse(serialize(input))`
 * must equal `input` according to `codec.eq`.
 *
 * @remarks
 * Throws if the codec is not bijective in this direction, with a message
 * showing the expected value, the received value, and the serialized form.
 *
 * @example
 * ```ts
 * import { testSerializeThenParse } from 'vuqs/testing'
 *
 * // Passing test returns true
 * expect(testSerializeThenParse(codecs.integer, 42)).toBe(true)
 * // Failing test throws
 * expect(() => testSerializeThenParse(codecs.integer, NaN)).toThrow()
 * ```
 *
 * @param codec - The codec to test.
 * @param input - The value to serialize and parse back.
 * @returns `true` if the check passes, otherwise throws.
 */
export function testSerializeThenParse<T>(codec: Codec<T>, input: T): boolean {
  const serialized = codec.serialize(input)
  const parsed = codec.parse(serialized)

  if (parsed === undefined) {
    throw new Error(
      `[vuqs] testSerializeThenParse: parsed value is undefined`
      + ` (when parsing ${JSON.stringify(serialized)} serialized from ${JSON.stringify(input)})`,
    )
  }

  if (!codec.eq(input, parsed)) {
    throw new Error(
      `[vuqs] codec is not bijective (in testSerializeThenParse)\n`
      + `  Expected value:         ${typeof input === 'object' ? JSON.stringify(input) : input}\n`
      + `  Received parsed value:  ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}\n`
      + `  Serialized as: ${JSON.stringify(serialized)}`,
    )
  }

  return true
}

/**
 * Tests the parse-then-serialize direction of a codec: `serialize(parse(serialized))`
 * must equal `serialized` structurally (via {@link structuralEq}).
 *
 * @remarks
 * Throws if the codec is not bijective in this direction, or if the input is
 * rejected by `codec.parse` (returns `undefined`).
 *
 * @example
 * ```ts
 * import { testParseThenSerialize } from 'vuqs/testing'
 *
 * // Passing test returns true
 * expect(testParseThenSerialize(codecs.integer, '42')).toBe(true)
 * // Failing test throws (input rejected)
 * expect(() => testParseThenSerialize(codecs.integer, 'not-a-number')).toThrow()
 * ```
 *
 * @param codec - The codec to test.
 * @param serialized - The raw value to parse and re-serialize.
 * @returns `true` if the check passes, otherwise throws.
 */
export function testParseThenSerialize<T>(codec: Codec<T>, serialized: ParsedQueryValue): boolean {
  const parsed = codec.parse(serialized)

  if (parsed === undefined) {
    throw new Error(
      `[vuqs] testParseThenSerialize: parsed value is undefined`
      + ` (when parsing ${JSON.stringify(serialized)})`,
    )
  }

  const reSerialized = codec.serialize(parsed)

  if (!structuralEq(reSerialized, serialized)) {
    throw new Error(
      `[vuqs] codec is not bijective (in testParseThenSerialize)\n`
      + `  Expected serialized: ${JSON.stringify(serialized)}\n`
      + `  Received serialized: ${JSON.stringify(reSerialized)}\n`
      + `  Parsed value: ${JSON.stringify(parsed)}`,
    )
  }

  return true
}
