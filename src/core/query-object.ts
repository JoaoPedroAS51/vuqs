import type { ParsedQuery, ParsedQueryRaw, ParsedQueryValue } from './types'

/**
 * Narrows a query value to a plain (non-array) object.
 *
 * @internal
 */
export function isPlainObject(value: ParsedQueryValue): value is Record<string, ParsedQueryValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Deep-clones a query object so callers can mutate it without affecting the source.
 *
 * @internal
 */
export function cloneQuery(query: ParsedQuery): ParsedQueryRaw {
  return structuredClone(query) as ParsedQueryRaw
}

/**
 * Merges `next` over `base`, deep-merging nested plain objects and replacing
 * everything else.
 *
 * @remarks
 * Neither input is mutated. Values are not compacted: keys from either input are
 * kept as-is, so unmanaged params survive untouched.
 *
 * @internal
 */
export function mergeQueries(base: ParsedQuery, next: ParsedQuery): ParsedQueryRaw {
  const merged = cloneQuery(base)

  for (const [key, value] of Object.entries(next)) {
    merged[key] = mergeValue(merged[key], value)
  }

  return merged
}

/**
 * Returns a copy of a query with nullish values, blank strings, and empty arrays
 * and objects removed recursively.
 *
 * @remarks
 * A blank string is one that is empty or whitespace-only. Meaningful falsy
 * values such as `0` and `false` are kept. This keeps a managed key that
 * resolves to nothing from leaving a trace in the query. The input is not mutated.
 *
 * @internal
 */
export function compactQuery(query: ParsedQuery): ParsedQueryRaw {
  const compacted: ParsedQueryRaw = {}

  for (const [key, value] of Object.entries(query)) {
    const compactedValue = compactValue(value)

    if (compactedValue !== undefined) {
      compacted[key] = compactedValue
    }
  }

  return compacted
}

function mergeValue(base: ParsedQueryValue, next: ParsedQueryValue): ParsedQueryValue {
  if (isPlainObject(base) && isPlainObject(next)) {
    return mergeQueries(base, next)
  }

  return next
}

function compactValue(value: ParsedQueryValue): ParsedQueryValue {
  if (value === null || value === undefined) {
    return undefined
  }

  if (Array.isArray(value)) {
    const items = value.map(compactValue).filter(item => item !== undefined)

    return items.length ? items : undefined
  }

  if (isPlainObject(value)) {
    const compacted = compactQuery(value)

    return Object.keys(compacted).length ? compacted : undefined
  }

  if (typeof value === 'string' && !value.trim()) {
    return undefined
  }

  return value
}
