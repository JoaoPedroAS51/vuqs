/**
 * Compares two values structurally.
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

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.valueOf(), b.valueOf())
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
 * @typeParam T - The value type to clone.
 * @param value - The value to copy.
 * @returns A structurally independent copy of `value`.
 *
 * @internal
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
 * Filters out properties whose values are `undefined`.
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
 * Creates a property filter using `predicate`.
 *
 * @param predicate - Returns `true` for a key to keep.
 * @returns A function that copies an object's own enumerable string-keyed properties
 * whose keys satisfy `predicate`.
 *
 * @example
 * ```ts
 * const pickName = pickBy(key => key === 'name')
 * pickName({ name: 'Ada', age: 36 }) // { name: 'Ada' }
 * ```
 */
export function pickBy(predicate: (key: string) => boolean): <T extends object>(values: T) => Partial<T> {
  return values => filterByKey(values, predicate)
}

/**
 * Creates a property filter with the inverse selection of {@link pickBy}.
 *
 * @param predicate - Returns `true` for a key to drop.
 * @returns A function that copies an object's own enumerable string-keyed properties
 * whose keys do not satisfy `predicate`.
 */
export function omitBy(predicate: (key: string) => boolean): <T extends object>(values: T) => Partial<T> {
  return values => filterByKey(values, key => !predicate(key))
}
