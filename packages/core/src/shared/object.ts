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
 * Handy as a pipeline transform via `core.pipeline.tap`. When `predicate` reads
 * reactive sources, the result re-filters as they change, since the transform
 * runs inside the engine's reactive reads.
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
