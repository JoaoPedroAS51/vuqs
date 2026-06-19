import type { ParsedQuery, ParsedQueryRaw, ParsedQueryValue } from './types'
import { isPlainObject } from './query-object'

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Reads the value at a dot-path from a parsed query object.
 *
 * @remarks
 * Returns `undefined` when any segment along the path is missing or resolves to
 * something other than a plain object, such as a string, array, or `null`.
 *
 * @param query - The parsed query object to read from.
 * @param path - A dot-path, for example `'filters.sort'`.
 * @returns The value at `path`, or `undefined` when the path does not resolve.
 *
 * @example
 * ```ts
 * getPath({ filters: { sort: 'name' } }, 'filters.sort') // 'name'
 * ```
 */
export function getPath(query: ParsedQuery, path: string): ParsedQueryValue {
  let current: ParsedQueryValue = query

  for (const segment of path.split('.')) {
    if (!isPlainObject(current)) {
      return undefined
    }

    current = current[segment]
  }

  return current
}

/**
 * Writes a value at a dot-path, creating intermediate plain objects as needed.
 *
 * @remarks
 * Mutates `target` in place and preserves existing sibling keys. Intended to
 * build a fresh object during serialization. As a prototype-pollution guard, a
 * path whose segments include `__proto__`, `constructor`, or `prototype` is
 * rejected and `target` is returned unchanged.
 *
 * @param target - The object to write into.
 * @param path - A dot-path, for example `'filters.sort'`.
 * @param value - The value to set at `path`.
 * @returns The same `target` reference, for chaining.
 *
 * @example
 * ```ts
 * setPath({}, 'filters.sort', 'name') // { filters: { sort: 'name' } }
 * ```
 */
export function setPath(target: ParsedQueryRaw, path: string, value: ParsedQueryValue): ParsedQueryRaw {
  const segments = path.split('.')
  // `path.split('.')` always yields at least one segment, so the final one is defined.
  const finalSegment = segments.at(-1)!

  if (segments.some(segment => UNSAFE_PATH_SEGMENTS.has(segment))) {
    return target
  }

  let current = target

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]

    if (!isPlainObject(next)) {
      current[segment] = {}
    }

    current = current[segment] as ParsedQueryRaw
  }

  current[finalSegment] = value

  return target
}

/**
 * Deletes the key at a dot-path, leaving sibling keys untouched.
 *
 * @remarks
 * Mutates `target` in place. No-op when the path does not resolve through a
 * chain of plain objects.
 *
 * @param target - The object to delete from.
 * @param path - A dot-path, for example `'filters.sort'`.
 */
export function deletePath(target: ParsedQueryRaw, path: string): void {
  const segments = path.split('.')
  // `path.split('.')` always yields at least one segment, so the final one is defined.
  const finalSegment = segments.at(-1)!

  let current: ParsedQueryRaw = target

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]

    if (!isPlainObject(next)) {
      return
    }

    current = next
  }

  delete current[finalSegment]
}

/**
 * Removes empty-object ancestors left behind after deleting a key at `path`.
 *
 * @remarks
 * Walks from the deepest parent upward, deleting each ancestor that became an
 * empty object, and stops at the first non-empty ancestor since its parents
 * cannot be empty. Only ancestors along `path` are touched, so unrelated keys
 * survive.
 *
 * @param target - The object to prune.
 * @param path - The dot-path whose now-empty ancestors should be removed.
 *
 * @internal
 */
export function pruneEmptyAncestors(target: ParsedQueryRaw, path: string): void {
  const segments = path.split('.')

  for (let depth = segments.length - 1; depth >= 1; depth--) {
    const prefix = segments.slice(0, depth).join('.')
    const node = getPath(target, prefix)

    if (!isPlainObject(node) || Object.keys(node).length > 0) {
      break
    }

    deletePath(target, prefix)
  }
}

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

/**
 * Returns the leaf dot-paths present in a query object.
 *
 * @remarks
 * Arrays are treated as leaf values and not traversed into. Used by the
 * {@link queryParam} serialize guard to validate which keys were written.
 *
 * @param value - The query value to walk.
 * @param prefix - The accumulated dot-path prefix, used during recursion.
 * @returns The leaf dot-paths, for example `['filters.sort', 'page']`.
 *
 * @internal
 */
export function collectLeafPaths(value: ParsedQueryValue, prefix = ''): string[] {
  if (!isPlainObject(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

function normalizeString(value: ParsedQueryValue): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
