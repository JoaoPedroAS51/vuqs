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
