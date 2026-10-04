import type { ParsedQueryValue } from './types'

/**
 * Reads a non-empty string from a scalar query value or the first item of an array.
 *
 * @param value - A scalar or array query value.
 * @returns The resolved non-empty string, or `undefined`.
 */
export function getQueryString(value: ParsedQueryValue): string | undefined {
  if (Array.isArray(value)) {
    return normalizeString(value[0])
  }

  return normalizeString(value)
}

/**
 * Reads every non-empty string from a scalar or array query value.
 *
 * @param value - A scalar or array query value.
 * @returns The non-empty strings in order, possibly empty.
 */
export function getQueryStringArray(value: ParsedQueryValue): string[] {
  if (!Array.isArray(value)) {
    const single = getQueryString(value)

    return single ? [single] : []
  }

  return value.flatMap((item) => {
    const single = normalizeString(item)

    return single ? [single] : []
  })
}

function normalizeString(value: ParsedQueryValue): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
