import type { WritableComputedRef } from 'vue'
import type { Codec, CodecWithDefault } from './codec'
import type { QueryParamDefinition, QueryParamDefinitionWithDefault } from './define-query-param'
import type { DefinedQueryModule, QueryStateApiOf } from './module'
import type { QueryStateSchema } from './schema'
import type { NavigateOptions } from './types'
import type { UseQueryStatesOptions } from './use-query-states'
import { createQueryBinding } from './binding'
import { codecs } from './codec'
import { defineQueryParam } from './define-query-param'
import { applyQueryStateModule } from './module'

interface SingleQueryStateSchema<T> extends QueryStateSchema {
  value: QueryParamDefinition<T>
}

/**
 * A writable ref bound to one query param, returned by {@link useQueryState}.
 *
 * @remarks
 * Reading yields the current value, or the codec default when the param is
 * absent. Assigning `.value` schedules a write with the default navigation
 * options. `set` and `clear` do the same while accepting per-call overrides.
 * Calling `clear`, or assigning `undefined` to a nullable param, removes the
 * param from the URL.
 *
 * @typeParam T - The param's value type.
 */
export interface QueryStateRef<T> extends WritableComputedRef<T> {
  /** Writes `value`, optionally overriding the navigation options for this write. */
  set: (value: T, options?: NavigateOptions) => void
  /** Removes the param from the URL, optionally overriding the navigation options. */
  clear: (options?: NavigateOptions) => void
}

/**
 * A {@link QueryStateRef} with module support, returned by {@link useQueryState}.
 *
 * @remarks
 * Calling `use` mutates and returns the same ref object, so ref identity and
 * Vue ref behavior are preserved while the added API widens the type. Call
 * `use` synchronously while a Vue effect scope is active.
 *
 * @typeParam T - The ref value type.
 * @typeParam TApi - The API accumulated so far.
 */
export type UseQueryStateReturn<T, TApi = object, TValue = T> = QueryStateRef<T> & TApi & {
  use: {
    <TModule>(
      module: TModule & DefinedQueryModule<any, any, any>,
    ): UseQueryStateReturn<T, TApi & QueryStateApiOf<TModule, SingleQueryStateSchema<TValue>, 'value'>, TValue>
  }
}

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
export function useQueryState<T>(
  path: string,
  codec: CodecWithDefault<T>,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<T, object, T>
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
export function useQueryState<T>(
  path: string,
  codec: Codec<T>,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<T | undefined, object, T>
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
export function useQueryState(
  path: string,
  options: StringQueryStateOptions & { defaultValue: string },
): UseQueryStateReturn<string, object, string>
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
export function useQueryState(
  path: string,
  options?: StringQueryStateOptions,
): UseQueryStateReturn<string | undefined, object, string>
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
export function useQueryState<T>(
  definition: QueryParamDefinitionWithDefault<T>,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<T, object, T>
/**
 * Binds a pre-built definition to a writable ref.
 *
 * @typeParam T - The param's value type.
 * @param definition - A definition from {@link defineQueryParam}.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * The query source and URL writer come from the provided adapter.
 * @returns A writable ref holding the value, or `undefined` when the param is absent.
 */
export function useQueryState<T>(
  definition: QueryParamDefinition<T>,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<T | undefined, object, T>
export function useQueryState<T>(
  pathOrDefinition: string | QueryParamDefinition<T>,
  codecOrOptions?: Codec<T> | (UseQueryStatesOptions & { defaultValue?: string }),
  maybeOptions?: UseQueryStatesOptions,
): UseQueryStateReturn<T | undefined, object, T> {
  if (typeof pathOrDefinition !== 'string') {
    return toQueryStateRef(pathOrDefinition, (codecOrOptions as UseQueryStatesOptions | undefined) ?? {})
  }

  const path = pathOrDefinition

  if (isCodec(codecOrOptions)) {
    return toQueryStateRef(defineQueryParam(path, codecOrOptions), maybeOptions ?? {})
  }

  const { defaultValue, ...navigateOptions } = codecOrOptions ?? {}
  const codec = defaultValue === undefined ? codecs.string : codecs.string.withDefault(defaultValue)

  return toQueryStateRef(defineQueryParam(path, codec), navigateOptions) as unknown as UseQueryStateReturn<T | undefined, object, T>
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
): UseQueryStateReturn<T | undefined, object, T> {
  const schema = { value: definition } satisfies SingleQueryStateSchema<T>
  const { engine, refs, core } = createQueryBinding(schema, options)

  const queryRef = Object.assign(refs.value, {
    set: (value: unknown, perCall?: NavigateOptions) => engine.query.set('value', value, perCall),
    clear: (perCall?: NavigateOptions) => engine.query.set('value', undefined, perCall),
  }) as UseQueryStateReturn<T | undefined, object, T>

  queryRef.use = ((module: DefinedQueryModule<any, any, any>) => {
    applyQueryStateModule(queryRef, core, 'value', module)

    return queryRef
  }) as UseQueryStateReturn<T | undefined, object, T>['use']

  return queryRef
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
