import type { NavigateOptions } from '../runtime/adapter'
import type { QueryStateRefInput, QueryStateSchema } from '../schema/schema'
import type { QueryBindingSource, QueryReadMap, QueryReadShape } from './binding'
import type { QueryStateRef } from './use-query-state'
import { computed } from 'vue'
import { transactQueryKey } from './binding'

/**
 * The per-field refs produced by {@link toQueryRefs}: one {@link QueryStateRef}
 * per schema param.
 *
 * @typeParam TSchema - The schema the binding exposes.
 * @typeParam TRead - The read value of each param after module effects.
 */
export type ToQueryRefs<TSchema extends QueryStateSchema, TRead extends QueryReadShape<TSchema> = QueryReadMap<TSchema>> = {
  [Key in keyof TSchema]: QueryStateRef<TRead[Key], QueryStateRefInput<TSchema[Key]>>
}

/**
 * Explodes a query binding into one writable ref per param.
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
export function toQueryRefs<TSchema extends QueryStateSchema, TRead extends QueryReadShape<TSchema>>(
  query: QueryBindingSource<TSchema, TRead>,
): ToQueryRefs<TSchema, TRead> {
  const { binding } = query
  const result: Record<string, unknown> = {}

  for (const key of binding.keys) {
    const fieldRef = computed({
      get: () => (binding.read.value as Record<string, unknown>)[key],
      set: value => transactQueryKey(binding, key, value),
    })

    result[key] = Object.assign(fieldRef, {
      set: (value: unknown, options?: NavigateOptions) => transactQueryKey(binding, key, value, options),
      clear: (options?: NavigateOptions) => transactQueryKey(binding, key, undefined, options),
    })
  }

  return result as ToQueryRefs<TSchema, TRead>
}
