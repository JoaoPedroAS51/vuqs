import type { InjectionKey } from 'vue'
import type { QueryStateSchema } from 'vuqs'
import type { CreateQueryStoreOptions, QueryStore } from './create-query-store'
import { inject, provide } from 'vue'
import { createQueryStore } from './create-query-store'

/**
 * A typed injection key for a query store.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStoreKey<TSchema extends QueryStateSchema, TContext extends string = string>
  = InjectionKey<QueryStore<TSchema, TContext>>

/**
 * Creates a typed injection key for a query store.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 * @param description - A label shown in devtools.
 * @returns A unique injection key.
 */
export function createQueryStoreKey<TSchema extends QueryStateSchema, TContext extends string = string>(
  description = 'vuqs-store',
): QueryStoreKey<TSchema, TContext> {
  return Symbol(description)
}

/**
 * Creates a query store and provides it to descendant components.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 * @param key - The injection key descendants will read.
 * @param options - The store options (see {@link createQueryStore}).
 * @returns The created store, also usable by the providing component.
 */
export function provideQueryStore<TSchema extends QueryStateSchema, TContext extends string = string>(
  key: QueryStoreKey<TSchema, TContext>,
  options: CreateQueryStoreOptions<TSchema, TContext>,
): QueryStore<TSchema, TContext> {
  const store = createQueryStore(options)

  provide(key, store)

  return store
}

/**
 * Reads a store provided by an ancestor via {@link provideQueryStore}.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 * @param key - The injection key the ancestor provided.
 * @returns The provided store.
 * @throws {Error} When no matching store was provided by an ancestor.
 */
export function useQueryStore<TSchema extends QueryStateSchema, TContext extends string = string>(
  key: QueryStoreKey<TSchema, TContext>,
): QueryStore<TSchema, TContext> {
  const store = inject(key)

  if (!store) {
    throw new Error('[vuqs] useQueryStore must be called under a matching provideQueryStore.')
  }

  return store
}
