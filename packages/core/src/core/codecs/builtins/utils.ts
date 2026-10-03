import type { ParsedQueryValue } from '../../query/types'
import { getQueryString } from '../../query/value'

const INTEGER_PATTERN = /^[+-]?\d+$/

export type QueryScalar = string | number | boolean

export function fromQueryScalar<T>(decode: (value: QueryScalar) => T | undefined): (raw: ParsedQueryValue) => T | undefined {
  return (raw) => {
    const value = Array.isArray(raw) ? raw[0] : raw

    if (value === null || value === undefined || typeof value === 'object') {
      return undefined
    }

    return decode(value)
  }
}

export function fromQueryString<T>(decode: (text: string) => T | undefined): (raw: ParsedQueryValue) => T | undefined {
  return (raw) => {
    const text = getQueryString(raw)

    return text === undefined ? undefined : decode(text)
  }
}

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

export function parseInteger(value: QueryScalar): number | undefined {
  if (typeof value === 'string' && !INTEGER_PATTERN.test(value)) {
    return undefined
  }

  const parsed = parseNumber(value)
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined
}

// `structuralEq` reads `Object.keys(date)`, which is always empty, so every
// pair of `Date` values would otherwise compare as equal.
export function dateEq(a: Date, b: Date): boolean {
  return a.valueOf() === b.valueOf()
}
