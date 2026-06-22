import type { Codec, CodecWithDefault } from './codec'
import type { QueryStateDefinition } from './define-query-state'
import type { QueryStateRef, UseQueryStatesOptions } from './use-query-states'
import { codecs } from './codec'
import { defineQueryState } from './define-query-state'
import { useQueryStates } from './use-query-states'

/**
 * Options for the string-implicit form. Forbids the `parse` and `serialize` keys
 * so a {@link Codec} routes to the codec overloads instead.
 *
 * @internal
 */
type StringQueryStateOptions = UseQueryStatesOptions & { parse?: never, serialize?: never }

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
 * Optional: omitted parts fall back to a provided adapter.
 * @returns A writable ref that always holds a value.
 */
export function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
/**
 * Binds a single query key to a writable ref via a codec.
 *
 * @typeParam T - The field's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - The codec that reads and writes the value at `path`.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * Optional: omitted parts fall back to a provided adapter.
 * @returns A writable ref holding the value, or `undefined` when the key is absent.
 *
 * @example
 * ```ts
 * const q = useQueryState('q', codecs.string, { query: () => route.query, navigate })
 * ```
 */
export function useQueryState<T>(path: string, codec: Codec<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>
/**
 * Binds a single query key as a string with a default, with no codec needed.
 *
 * @remarks
 * Shorthand for `codecs.string.withDefault(options.defaultValue)`. This default
 * is `string`-only; for other types pass a codec, for example
 * `codecs.integer.withDefault(0)`.
 *
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param options - Navigation defaults plus the `defaultValue` string. The query
 * source and navigate adapter may be omitted when an adapter is provided.
 * @returns A writable ref that always holds a string.
 *
 * @example
 * ```ts
 * const q = useQueryState('q', { defaultValue: '' })
 * ```
 */
export function useQueryState(path: string, options: StringQueryStateOptions & { defaultValue: string }): QueryStateRef<string>
/**
 * Binds a single query key as a string, using an implicit `codecs.string`.
 *
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * Optional: omitted parts fall back to a provided adapter.
 * @returns A writable ref holding the string, or `undefined` when the key is absent.
 *
 * @example
 * ```ts
 * const q = useQueryState('q') // string | undefined, query and navigate from the adapter
 * ```
 */
export function useQueryState(path: string, options?: StringQueryStateOptions): QueryStateRef<string | undefined>
/**
 * Binds a pre-built definition to a writable ref.
 *
 * @typeParam T - The field's value type.
 * @param definition - A definition from {@link defineQueryState}.
 * @param options - The query source, navigate adapter, and navigation defaults.
 * Optional: omitted parts fall back to a provided adapter.
 * @returns A writable ref holding the value, or `undefined` when the field is absent.
 */
export function useQueryState<T>(definition: QueryStateDefinition<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>
export function useQueryState<T>(
  pathOrDefinition: string | QueryStateDefinition<T>,
  codecOrOptions?: Codec<T> | (UseQueryStatesOptions & { defaultValue?: string }),
  maybeOptions?: UseQueryStatesOptions,
): QueryStateRef<T | undefined> {
  if (typeof pathOrDefinition !== 'string') {
    return useQueryStates(
      { state: pathOrDefinition },
      (codecOrOptions as UseQueryStatesOptions | undefined) ?? {},
    ).state
  }

  const path = pathOrDefinition

  if (isCodec(codecOrOptions)) {
    return useQueryStates({ state: defineQueryState(path, codecOrOptions) }, maybeOptions ?? {}).state
  }

  const { defaultValue, ...navigateOptions } = codecOrOptions ?? {}
  const codec = defaultValue === undefined ? codecs.string : codecs.string.withDefault(defaultValue)

  return useQueryStates({ state: defineQueryState(path, codec) }, navigateOptions).state as QueryStateRef<T | undefined>
}

/**
 * Duck-types a {@link Codec} to tell the codec overloads from the options forms
 * at runtime.
 *
 * @internal
 */
function isCodec<T>(
  value: Codec<T> | (UseQueryStatesOptions & { defaultValue?: string }) | undefined,
): value is Codec<T> {
  return value !== undefined
    && typeof (value as Codec<T>).parse === 'function'
    && typeof (value as Codec<T>).serialize === 'function'
}
