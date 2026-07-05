import type { QueryBindingSource } from './binding'
import type { QueryStateRefValue, QueryStateSchema } from './schema'
import type { NavigateOptions } from './types'
import type { QueryStateRef } from './use-query-state'
import { computed } from 'vue'

/**
 * The per-field refs produced by {@link toQueryRefs}: one {@link QueryStateRef}
 * per schema param.
 *
 * @remarks
 * Each ref carries the param's own value type, so a defaulted param drops
 * `undefined` while a bare codec keeps it, matching the composable's `values`.
 *
 * @typeParam TSchema - The schema the binding exposes.
 */
export type ToQueryRefs<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRef<QueryStateRefValue<TSchema[Key]>>
}

/**
 * Explodes a query binding into one writable ref per param.
 *
 * @remarks
 * Each ref is a {@link QueryStateRef}: a writable ref whose `.value` reads and
 * writes, plus `.set(value, options)` and `.clear(options)` for per-call
 * navigation options. Assigning `undefined`, like `.clear()`, removes the param.
 *
 * Pass the {@link useQueryStates} composable. For read-only per-field refs over a
 * module's `selected`/`defaults` map, use Vue's `toRefs` directly.
 *
 * @typeParam TSchema - The schema the binding exposes.
 * @param query - The {@link useQueryStates} composable to explode.
 * @returns One writable {@link QueryStateRef} per param.
 *
 * @example
 * ```ts
 * const query = useQueryStates(schema)
 * const { q, sort } = toQueryRefs(query)
 *
 * q.value = 'sale'
 * sort.set('newest', { history: 'push' })
 * q.clear()
 * ```
 */
export function toQueryRefs<TSchema extends QueryStateSchema>(
  query: QueryBindingSource<TSchema>,
): ToQueryRefs<TSchema> {
  const { binding } = query
  const result: Record<string, unknown> = {}

  for (const key of binding.keys) {
    const fieldRef = computed({
      get: () => (binding.read.value as Record<string, unknown>)[key],
      set: value => binding.write(key, value),
    })

    result[key] = Object.assign(fieldRef, {
      set: (value: unknown, options?: NavigateOptions) => binding.write(key, value, options),
      clear: (options?: NavigateOptions) => binding.write(key, undefined, options),
    })
  }

  return result as ToQueryRefs<TSchema>
}
