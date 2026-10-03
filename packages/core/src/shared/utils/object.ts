/**
 * Compares two values structurally.
 *
 * @remarks
 * Primitives compare with `Object.is`. Arrays compare by index and plain objects
 * compare by key, both recursively. Codecs use this by default so arrays and plain
 * objects can equal freshly parsed values with different references.
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

function filterByKey<T extends object>(values: T, keep: (key: string) => boolean): Partial<T> {
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(values)) {
    if (keep(key)) {
      result[key] = (values as Record<string, unknown>)[key]
    }
  }

  return result as Partial<T>
}

/**
 * Returns a copy without `undefined`-valued keys, so a cleared param reads as
 * absent rather than overwriting a default when layered.
 *
 * @typeParam T - The object's type, preserved on the result.
 * @param values - The object to copy.
 * @returns A copy without `undefined`-valued keys.
 */
export function definedOnly<T extends object>(values: T): T {
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(values)) {
    const value = (values as Record<string, unknown>)[key]

    if (value !== undefined) {
      result[key] = value
    }
  }

  return result as T
}

/**
 * Builds a function that returns a copy of an object keeping only the keys for
 * which `predicate` returns `true`.
 *
 * @remarks
 * The returned function evaluates `predicate` on each call and does not mutate
 * the input object.
 *
 * @param predicate - Returns `true` for a key to keep.
 * @returns A function that filters an object's keys.
 *
 * @example
 * ```ts
 * core.pipeline.tap(['read', 'write'], pickBy(key => isValidIn(key, active.value)))
 * ```
 */
export function pickBy(predicate: (key: string) => boolean): <T extends object>(values: T) => Partial<T> {
  return values => filterByKey(values, predicate)
}

/**
 * Builds a function that returns a copy of an object dropping the keys for which
 * `predicate` returns `true`. The inverse of {@link pickBy}.
 *
 * @param predicate - Returns `true` for a key to drop.
 * @returns A function that filters an object's keys.
 */
export function omitBy(predicate: (key: string) => boolean): <T extends object>(values: T) => Partial<T> {
  return values => filterByKey(values, key => !predicate(key))
}
