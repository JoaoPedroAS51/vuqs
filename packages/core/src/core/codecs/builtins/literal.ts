import type { Codec } from '../codec'
import { createCodec } from '../codec'
import { fromQueryScalar, fromQueryString, parseNumber } from './utils'

/**
 * Builds a codec for a string constrained to one of `values`.
 *
 * @throws {TypeError} If the list mixes types or contains values other than strings or numbers.
 */
export function literalCodec<const T extends string>(values: readonly T[]): Codec<T>

/**
 * Builds a codec for a number constrained to one of `values`.
 *
 * @throws {TypeError} If the list mixes types or contains values other than strings or numbers.
 */
export function literalCodec<const T extends number>(values: readonly T[]): Codec<T>

export function literalCodec(values: readonly string[] | readonly number[]): Codec<string | number> {
  const valueType = typeof values[0]

  for (const value of values) {
    const type = typeof value
    if ((type !== 'string' && type !== 'number') || type !== valueType) {
      throw new TypeError('[vuqs] codecs.literal: values must be all strings or all numbers.')
    }
  }

  const allowed = new Set<string | number>(values)

  return createCodec<string | number>({
    parse: valueType === 'number'
      ? fromQueryScalar((value) => {
          const parsed = parseNumber(value)
          return parsed !== undefined && allowed.has(parsed) ? parsed : undefined
        })
      : fromQueryString(text => allowed.has(text) ? text : undefined),
    serialize: value => String(value),
  })
}
