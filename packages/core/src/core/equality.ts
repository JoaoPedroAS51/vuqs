/**
 * Compares two values structurally.
 *
 * @remarks
 * Primitives compare with `Object.is`. Arrays compare by index and plain objects
 * compare by key, both recursively. This is the default equality for codecs so
 * that array and object values can match a freshly parsed value, where reference
 * equality never would.
 *
 * @param a - The first value.
 * @param b - The second value.
 * @returns `true` when the values are structurally equal.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is | `Object.is`}
 */
export function structuralEq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }

    return a.every((item, index) => structuralEq(item, b[index]))
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)

  if (aKeys.length !== bKeys.length) {
    return false
  }

  return aKeys.every(key =>
    structuralEq((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}

/**
 * Deep-copies a decoded value so callers cannot alias a shared source.
 *
 * @remarks
 * Handles the value shapes a codec decodes to: primitives are returned as-is,
 * `Date` is rebuilt, and arrays and plain objects are cloned recursively. Avoids
 * `structuredClone`, which throws on Vue reactive proxies. Class instances other
 * than `Date` are returned by reference, since the decoded values a codec
 * produces do not include them.
 *
 * @typeParam T - The value type to clone.
 * @param value - The value to copy.
 * @returns A structurally independent copy of `value`.
 */
export function structuralClone<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }

  if (Array.isArray(value)) {
    return value.map(item => structuralClone(item)) as T
  }

  const result: Record<string, unknown> = {}

  for (const key of Object.keys(value)) {
    result[key] = structuralClone((value as Record<string, unknown>)[key])
  }

  return result as T
}
