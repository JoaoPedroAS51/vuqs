import type { ParsedQueryValue } from './types'

/**
 * Reads a non-empty string from a scalar query value or the first item of an array.
 *
 * @remarks
 * For an array, only the first item is considered. A value that is not a string,
 * or a string that is empty or whitespace-only, yields `undefined`. Useful when
 * writing a custom codec over a value that may arrive as a single string or a
 * repeated key.
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
 * @remarks
 * A scalar becomes a single-item array, or an empty array when it is not a
 * non-empty string. Array items that are non-string, empty, or whitespace-only
 * are dropped.
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
