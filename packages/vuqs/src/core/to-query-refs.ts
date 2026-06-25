import type { ComputedRef } from 'vue'
import type { NavigateOptions, QueryStateRef } from './use-query-states'
import { computed } from 'vue'
import { WRITER } from './use-query-states'

/**
 * The per-field refs produced by {@link toQueryRefs}.
 *
 * @remarks
 * The writable `values` map carries the hidden {@link WRITER} brand, so it
 * explodes into a {@link QueryStateRef} per field — writable, with `.set`/
 * `.clear`. A read-only map (`selected`/`defaults`/`effective`) has no brand, so
 * it explodes into a read-only ref per field.
 *
 * @typeParam T - The map being exploded into refs.
 */
export type ToQueryRefs<T> = typeof WRITER extends keyof T
  ? { [K in Exclude<keyof T, typeof WRITER>]: QueryStateRef<T[K]> }
  : { [K in keyof T]: ComputedRef<T[K]> }

/**
 * Explodes a query value map into one ref per field, the way Pinia's
 * `storeToRefs` explodes a store.
 *
 * @remarks
 * Pass the writable `values` map and each ref is a {@link QueryStateRef}: a
 * writable ref whose `.value` reads and writes, plus `.set(value, options)` and
 * `.clear(options)` for per-call navigation options. Pass a read-only map
 * (`selected`/`defaults`/`effective`) and each ref is read-only.
 *
 * The helper carries no behavior of its own: writes route back through the map,
 * so a ref off the effective `values` clears against the effective default
 * exactly as `values.x = …` would. Assigning `undefined` to a writable ref, like
 * `.clear()`, removes the param.
 *
 * @typeParam T - The map being exploded.
 * @param map - A query value map from {@link useQueryStates} or a module.
 * @returns One ref per field; writable for `values`, read-only otherwise.
 *
 * @example
 * ```ts
 * const { values } = useQueryStates(schema)
 * const { q, sort } = toQueryRefs(values)
 *
 * q.value = 'sale'
 * sort.set('newest', { history: 'push' })
 * q.clear()
 * ```
 */
export function toQueryRefs<T extends object>(map: T): ToQueryRefs<T> {
  const writer = (map as Record<PropertyKey, unknown>)[WRITER] as
    | ((values: Record<string, unknown>, options?: NavigateOptions) => void)
    | undefined

  const result: Record<string, unknown> = {}

  for (const key of Object.keys(map)) {
    if (writer === undefined) {
      result[key] = computed(() => (map as Record<string, unknown>)[key])
      continue
    }

    const fieldRef = computed({
      get: () => (map as Record<string, unknown>)[key],
      set: (value) => {
        (map as Record<string, unknown>)[key] = value
      },
    })

    result[key] = Object.assign(fieldRef, {
      set: (value: unknown, options?: NavigateOptions) =>
        writer({ [key]: value === undefined ? null : value }, options),
      clear: (options?: NavigateOptions) => writer({ [key]: null }, options),
    })
  }

  return result as ToQueryRefs<T>
}
