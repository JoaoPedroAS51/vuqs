import type { Codec, CodecWithDefault } from './codec'
import type { QueryStateDefinition } from './define-query-state'
import type { QueryStateRef, UseQueryStatesOptions } from './use-query-states'
import { defineQueryState } from './define-query-state'
import { useQueryStates } from './use-query-states'

/**
 * Binds a single query key to a writable ref, using a codec with a static default.
 *
 * @remarks
 * The default makes the ref non-nullable: reading an absent key yields the default.
 *
 * @typeParam T - The field's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - A codec carrying a default, from {@link Codec.withDefault}.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * @returns A writable ref that always holds a value.
 */
export function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options: UseQueryStatesOptions): QueryStateRef<T>
/**
 * Binds a single query key to a writable ref.
 *
 * @typeParam T - The field's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - The codec that reads and writes the value at `path`.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * @returns A writable ref holding the value, or `undefined` when the key is absent.
 *
 * @example
 * ```ts
 * const q = useQueryState('q', codecs.string, { query: () => route.query, navigate })
 * ```
 */
export function useQueryState<T>(path: string, codec: Codec<T>, options: UseQueryStatesOptions): QueryStateRef<T | undefined>
/**
 * Binds a pre-built definition to a writable ref.
 *
 * @typeParam T - The field's value type.
 * @param definition - A definition from {@link defineQueryState}.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * @returns A writable ref holding the value, or `undefined` when the field is absent.
 */
export function useQueryState<T>(definition: QueryStateDefinition<T>, options: UseQueryStatesOptions): QueryStateRef<T | undefined>
export function useQueryState<T>(
  pathOrDefinition: string | QueryStateDefinition<T>,
  codecOrOptions: Codec<T> | UseQueryStatesOptions,
  maybeOptions?: UseQueryStatesOptions,
): QueryStateRef<T | undefined> {
  const definition = typeof pathOrDefinition === 'string'
    ? defineQueryState(pathOrDefinition, codecOrOptions as Codec<T>)
    : pathOrDefinition

  const options = (typeof pathOrDefinition === 'string' ? maybeOptions : codecOrOptions) as UseQueryStatesOptions

  return useQueryStates({ state: definition }, options).state
}
