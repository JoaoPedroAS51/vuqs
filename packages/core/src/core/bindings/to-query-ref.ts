import type { WritableComputedRef } from 'vue'
import type { NavigateOptions } from '../runtime/adapter'
import type { QueryStateSchema, QueryStateValues } from '../schema/schema'
import type { QueryBindingSource } from './binding'
import { computed } from 'vue'
import { definedOnly, structuralEq } from '../../shared/utils/object'

/**
 * The whole-object writable ref produced by {@link toQueryRef}.
 *
 * @typeParam TSchema - The schema the binding exposes.
 */
export interface QueryRef<TSchema extends QueryStateSchema>
  extends WritableComputedRef<QueryStateValues<TSchema>> {
  /**
   * Replaces the whole state as one atomic transaction, optionally overriding
   * navigation options.
   */
  set: (value: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  /** Clears every param, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * Binds a whole schema to one writable ref: a plain snapshot on read, an
 * exhaustive replace on write.
 *
 * @typeParam TSchema - The schema the binding exposes.
 * @param query - The {@link useQueryStates} composable to bind.
 * @returns A writable ref over the whole object, plus `.set`/`.clear`.
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
export function toQueryRef<TSchema extends QueryStateSchema>(
  query: QueryBindingSource<TSchema>,
): QueryRef<TSchema> {
  const { binding } = query

  const replace = (next: QueryStateValues<TSchema>, options?: NavigateOptions): void => {
    binding.transact({ mode: 'replace', values: next, navigation: options })
  }

  // Return the same reference while the snapshot content is unchanged: binding.read
  // rebuilds a fresh object on every navigation, so without this a v-model over the
  // whole object would see a new identity each tick and loop.
  let cache: QueryStateValues<TSchema> | undefined
  const ref = computed<QueryStateValues<TSchema>>({
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
    set: (next: QueryStateValues<TSchema>, options?: NavigateOptions) => replace(next, options),
    clear: (options?: NavigateOptions) => replace({}, options),
  }) as QueryRef<TSchema>
}
