import type { ParsedQueryValue } from '../../query/types'
import { getQueryString } from '../../query/value'

const INTEGER_PATTERN = /^[+-]?\d+$/

export type QueryScalar = string | number | boolean

/**
 * Wraps a scalar decoder for query input, using the first item of arrays.
 *
 * @returns A parser that skips the decoder and returns `undefined` for
 * nullish values or objects.
 *
 * @internal
 */
export function fromQueryScalar<T>(decode: (value: QueryScalar) => T | undefined): (raw: ParsedQueryValue) => T | undefined {
  return (raw) => {
    const value = Array.isArray(raw) ? raw[0] : raw

    if (value === null || value === undefined || typeof value === 'object') {
      return undefined
    }

    return decode(value)
  }
}

/**
 * Wraps a string decoder for query input, using the first item of arrays.
 *
 * @returns A parser that decodes non-blank strings without coercing other types;
 * unsupported input returns `undefined`.
 *
 * @internal
 */
export function fromQueryString<T>(decode: (text: string) => T | undefined): (raw: ParsedQueryValue) => T | undefined {
  return (raw) => {
    const text = getQueryString(raw)

    return text === undefined ? undefined : decode(text)
  }
}

/**
 * Parses a finite number from a number or numeric string.
 *
 * @returns The parsed number, or `undefined` for booleans or invalid input.
 *
 * @internal
 */
export function parseNumber(value: QueryScalar): number | undefined {
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

/**
 * Parses a finite integer from a number or signed decimal string.
 *
 * @returns The parsed integer, or `undefined` for invalid input. Decimal-point
 * and exponent notation are rejected in strings.
 *
 * @internal
 */
export function parseInteger(value: QueryScalar): number | undefined {
  if (typeof value === 'string' && !INTEGER_PATTERN.test(value)) {
    return undefined
  }

  const parsed = parseNumber(value)
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined
}
