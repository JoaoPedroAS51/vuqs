import type { WritableComputedRef } from 'vue'
import type { QueryBindingSource } from './binding'
import type { QueryStateSchema, QueryStateValues } from './schema'
import type { NavigateOptions } from './types'
import { computed } from 'vue'
import { definedOnly } from '../shared'
import { structuralEq } from './equality'

/**
 * The whole-object writable ref produced by {@link toQueryRef}.
 *
 * @remarks
 * Reading yields a plain snapshot of the current params; writing replaces the
 * whole state. `.set`/`.clear` add per-call navigation options.
 *
 * @typeParam TSchema - The schema the binding exposes.
 */
export interface QueryRef<TSchema extends QueryStateSchema>
  extends WritableComputedRef<QueryStateValues<TSchema>> {
  /** Replaces the whole state, optionally overriding the navigation options. */
  set: (value: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  /** Clears every param, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * Binds a whole schema to one writable ref: a plain snapshot on read, an
 * exhaustive replace on write.
 *
 * @remarks
 * Reading yields a plain object with only the params that have a value: absent
 * params are omitted, defaulted params always appear. The snapshot keeps a stable
 * reference while its content is unchanged, so a `v-model` write-back cycle does
 * not churn identity. Assigning replaces the whole state: every param not present
 * in the assigned value is cleared. Absence is the clear signal, so this ref takes
 * no `null`.
 *
 * Pass the {@link useQueryStates} composable. Reach for it when the value *is* the
 * complete state, such as a form model or an API request object; for per-field
 * binding use {@link toQueryRefs} instead.
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
export function toQueryRef<TSchema extends QueryStateSchema>(
  query: QueryBindingSource<TSchema>,
): QueryRef<TSchema> {
  const { binding } = query

  const replace = (next: QueryStateValues<TSchema> | undefined, options?: NavigateOptions): void => {
    for (const key of binding.keys) {
      binding.write(key, (next as Record<string, unknown> | undefined)?.[key], options)
    }
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
