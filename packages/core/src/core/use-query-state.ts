import type { Codec, CodecWithDefault } from './codec'
import type { QueryParamDefinition, QueryParamDefinitionWithDefault } from './define-query-param'
import type { NavigateOptions, QueryStateRef, UseQueryStatesOptions } from './use-query-states'
import { codecs } from './codec'
import { defineQueryParam } from './define-query-param'
import { createQueryStateRefs } from './use-query-states'

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
 * @typeParam T - The param's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - A codec carrying a default, from {@link Codec.withDefault}.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided adapter.
 * @returns A writable ref that always holds a value.
 */
export function useQueryState<T>(path: string, codec: CodecWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
/**
 * Binds a single query key to a writable ref via a codec.
 *
 * @typeParam T - The param's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - The codec that reads and writes the value at `path`.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided adapter.
 * @returns A writable ref holding the value, or `undefined` when the key is absent.
 *
 * @example
 * ```ts
 * const q = useQueryState('q', codecs.string)
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
 * @param options - Behavior options plus the `defaultValue` string. The query
 * source and URL writer come from the provided adapter.
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
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided adapter.
 * @returns A writable ref holding the string, or `undefined` when the key is absent.
 *
 * @example
 * ```ts
 * const q = useQueryState('q') // string | undefined, query and navigate from the adapter
 * ```
 */
export function useQueryState(path: string, options?: StringQueryStateOptions): QueryStateRef<string | undefined>
/**
 * Binds a pre-built definition that declares a default to a writable ref.
 *
 * @remarks
 * The default makes the ref non-nullable: a missing key reads back as the default.
 *
 * @typeParam T - The param's value type.
 * @param definition - A definition carrying a default, from a codec's `withDefault`.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided adapter.
 * @returns A writable ref that always holds a value.
 */
export function useQueryState<T>(definition: QueryParamDefinitionWithDefault<T>, options?: UseQueryStatesOptions): QueryStateRef<T>
/**
 * Binds a pre-built definition to a writable ref.
 *
 * @typeParam T - The param's value type.
 * @param definition - A definition from {@link defineQueryParam}.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided adapter.
 * @returns A writable ref holding the value, or `undefined` when the param is absent.
 */
export function useQueryState<T>(definition: QueryParamDefinition<T>, options?: UseQueryStatesOptions): QueryStateRef<T | undefined>
export function useQueryState<T>(
  pathOrDefinition: string | QueryParamDefinition<T>,
  codecOrOptions?: Codec<T> | (UseQueryStatesOptions & { defaultValue?: string }),
  maybeOptions?: UseQueryStatesOptions,
): QueryStateRef<T | undefined> {
  if (typeof pathOrDefinition !== 'string') {
    return toQueryStateRef(pathOrDefinition, (codecOrOptions as UseQueryStatesOptions | undefined) ?? {})
  }

  const path = pathOrDefinition

  if (isCodec(codecOrOptions)) {
    return toQueryStateRef(defineQueryParam(path, codecOrOptions), maybeOptions ?? {})
  }

  const { defaultValue, ...navigateOptions } = codecOrOptions ?? {}
  const codec = defaultValue === undefined ? codecs.string : codecs.string.withDefault(defaultValue)

  return toQueryStateRef(defineQueryParam(path, codec), navigateOptions) as QueryStateRef<T | undefined>
}

/**
 * Wires a single definition into a {@link QueryStateRef} (a writable ref plus
 * `set`/`clear`), reusing the shared engine setup. `undefined` clears, matching
 * `.value = undefined`.
 *
 * @internal
 */
function toQueryStateRef<T>(
  definition: QueryParamDefinition<T>,
  options: UseQueryStatesOptions,
): QueryStateRef<T | undefined> {
  const { engine, refs } = createQueryStateRefs({ field: definition }, options)

  return Object.assign(refs.field, {
    set: (value: unknown, perCall?: NavigateOptions) => engine.query.set('field', value, perCall),
    clear: (perCall?: NavigateOptions) => engine.query.set('field', undefined, perCall),
  }) as QueryStateRef<T | undefined>
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
