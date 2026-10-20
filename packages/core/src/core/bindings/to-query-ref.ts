import type { WritableComputedRef } from 'vue'
import type { QueryWriteOptions } from '../runtime/transaction'
import type { QueryStateResolvedValues, QueryStateSchema, QueryStateValues } from '../schema/schema'
import type { QueryBindingSource, QueryReadShape } from './binding'
import { computed } from 'vue'
import { definedOnly, structuralEq } from '../../shared/utils/object'

/**
 * The whole-object writable ref produced by {@link toQueryRef}.
 *
 * @typeParam TSchema - The schema the binding exposes.
 */
export interface QueryRef<TSchema extends QueryStateSchema>
  extends WritableComputedRef<QueryStateResolvedValues<TSchema>, QueryStateValues<TSchema>> {
  /**
   * Replaces the whole state as one atomic transaction, optionally overriding
   * navigation and default omission.
   */
  set: (value: QueryStateValues<TSchema>, options?: QueryWriteOptions) => void
  /** Clears every param, optionally overriding the navigation options. */
  clear: (options?: QueryWriteOptions) => void
}

/**
 * Binds a whole schema to one writable ref: a plain snapshot on read, an
 * exhaustive replace on write.
 *
 * @typeParam TSchema - The schema the binding exposes.
 * @param query - The {@link useQueryStates} composable to bind.
 * @returns A writable ref over the whole object, plus `.set`/`.clear`.
 *
 * @example
 * ```ts
 * const query = useQueryStates(schema)
 * const filters = toQueryRef(query)
 *
 * filters.value = { q: 'phone', sort: 'desc' } // sets q + sort, clears the rest
 * filters.value = { ...filters.value, page: 2 } // keeps the object, sets page
 * filters.clear()
 * ```
 */
export function toQueryRef<TSchema extends QueryStateSchema, TRead extends QueryReadShape<TSchema>>(
  query: QueryBindingSource<TSchema, TRead>,
): QueryRef<TSchema> {
  const { binding } = query

  const replace = (next: QueryStateValues<TSchema>, options?: QueryWriteOptions): void => {
    const { clearOnDefault, ...navigation } = options ?? {}

    binding.transact({ mode: 'replace', values: next, navigation: options === undefined ? undefined : navigation, clearOnDefault })
  }

  // Keep equivalent snapshots stable to avoid feedback through v-model.
  let cache: QueryStateResolvedValues<TSchema> | undefined
  const ref = computed<QueryStateResolvedValues<TSchema>, QueryStateValues<TSchema>>({
    get: () => {
      const next = definedOnly(binding.read.value)

      if (cache !== undefined && structuralEq(cache, next)) {
        return cache
      }

      cache = next
      return next
    },
    set: next => replace(next),
  })

  return Object.assign(ref, {
    set: (next: QueryStateValues<TSchema>, options?: QueryWriteOptions) => replace(next, options),
    clear: (options?: QueryWriteOptions) => replace({}, options),
  }) as QueryRef<TSchema>
}
