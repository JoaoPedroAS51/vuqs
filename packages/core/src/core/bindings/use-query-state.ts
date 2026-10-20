import type { WritableComputedRef } from 'vue'
import type { Codec, CodecWithDefault } from '../codecs/codec'
import type { QueryStateUsable, StateModuleApi, StateModulePipeline, VerifiedStateModule } from '../module-system/composition'
import type { DefinedQueryStateModule } from '../module-system/contract'
import type { SingleParamSchema } from '../module-system/registry'
import type { ApplyPipelineEffects } from '../runtime/pipeline/contract'
import type { QueryWriteOptions } from '../runtime/transaction'
import type { AnyDefinedQueryParam, DefinedQueryParam } from '../schema/params/definition'
import type { QueryStateRefInput, QueryStateRefValue } from '../schema/schema'
import type { UseQueryStatesOptions } from './binding'
import { computed } from 'vue'
import { codecs } from '../codecs/catalog'
import { isCodec } from '../codecs/codec'
import { applyQueryStateModule } from '../module-system/apply-module'
import { queryParam } from '../schema/params/query-param'
import { createQueryBinding, transactQueryKey } from './binding'

/**
 * A writable ref bound to one query param, returned by {@link useQueryState}.
 *
 * @typeParam TRead - The value type the ref reads.
 * @typeParam TWrite - The value type the ref and `set` accept.
 *
 * @see https://vuqs.dev/guide/query-state/use-query-state
 */
export interface QueryStateRef<TRead, TWrite = TRead> extends WritableComputedRef<TRead, TWrite> {
  /** Writes `value`, optionally overriding navigation and default omission. */
  set: (value: TWrite, options?: QueryWriteOptions) => void
  /** Removes the param from the URL, optionally overriding the navigation options. */
  clear: (options?: QueryWriteOptions) => void
}

/**
 * The value a single param reads after the presence effects of the installed pipeline
 * descriptors. Without descriptors it is the base read contract.
 *
 * @typeParam TParam - The bound param.
 * @typeParam TDescriptors - The installed descriptors, in installation order.
 */
export type QueryStateReadOf<TParam extends AnyDefinedQueryParam, TDescriptors extends readonly unknown[]>
  = TDescriptors extends readonly []
    ? QueryStateRefValue<TParam>
    : ApplyPipelineEffects<{ value: QueryStateRefValue<TParam> }, TDescriptors> extends { value: infer TRead } ? TRead : QueryStateRefValue<TParam>

/**
 * A {@link QueryStateRef} with module support, returned by {@link useQueryState}.
 *
 * `use` returns the same ref with an extended type. Capture its return to retain
 * the accumulated module APIs and presence effects.
 *
 * @typeParam TParam - The bound param; its resolved value is read and its explicit value is written.
 * @typeParam TApi - The API the applied modules contributed.
 * @typeParam TDescriptors - The pipeline descriptors the applied modules installed, in order.
 */
export type UseQueryStateReturn<
  TParam extends AnyDefinedQueryParam,
  TApi = object,
  TDescriptors extends readonly unknown[] = [],
> = QueryStateRef<QueryStateReadOf<TParam, TDescriptors>, QueryStateRefInput<TParam>> & TApi & {
  use: <TModule extends QueryStateUsable<SingleParamSchema<TParam>>>(
    module: TModule & VerifiedStateModule<TModule, SingleParamSchema<TParam>>,
  ) => UseQueryStateReturn<
    TParam,
    TApi & StateModuleApi<TModule, SingleParamSchema<TParam>>,
    [...TDescriptors, ...StateModulePipeline<TModule, SingleParamSchema<TParam>>]
  >
}

type StringQueryStateOptions = UseQueryStatesOptions & { parse?: never, serialize?: never }

/**
 * Binds a single query key to a writable ref, using a codec with a static default.
 * The query source and URL writer come from the provided adapter.
 *
 * @typeParam T - The param's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - A codec carrying a default, from {@link Codec.withDefault}.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * @returns A writable ref that always holds a value.
 */
export function useQueryState<T>(
  path: string,
  codec: CodecWithDefault<T>,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<DefinedQueryParam<T, T, T, true>>

/**
 * Binds a single query key to a writable ref via a codec.
 * The query source and URL writer come from the provided adapter.
 *
 * @typeParam T - The param's value type.
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param codec - The codec that reads and writes the value at `path`.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
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
): UseQueryStateReturn<DefinedQueryParam<T, T, T, false>>

/**
 * Binds a single query key as a string with a default, with no codec needed.
 * The query source and URL writer come from the provided adapter.
 *
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param options - Behavior options plus the `defaultValue` string.
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
): UseQueryStateReturn<DefinedQueryParam<string, string, string, true>>

/**
 * Binds a single query key as a string, using an implicit `codecs.string`.
 * The query source and URL writer come from the provided adapter.
 *
 * @param path - A dot-path into the query object, for example `'filters.sort'`.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
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
): UseQueryStateReturn<DefinedQueryParam<string, string, string, false>>

/**
 * Binds a pre-built definition to a writable ref.
 * The query source and URL writer come from the provided adapter.
 *
 * @typeParam TParam - The bound param; reads resolve its defaults and writes accept its explicit values.
 * @param definition - A definition from {@link queryParam}.
 * @param options - Behavior options (navigation defaults, `throttleMs`, `clearOnDefault`).
 * @returns A writable ref holding the resolved value, or `undefined` when no static default guarantees one.
 */
export function useQueryState<TParam extends AnyDefinedQueryParam>(
  definition: TParam,
  options?: UseQueryStatesOptions,
): UseQueryStateReturn<TParam>

export function useQueryState(
  pathOrDefinition: string | AnyDefinedQueryParam,
  codecOrOptions?: Codec<unknown> | (UseQueryStatesOptions & { defaultValue?: string }),
  maybeOptions?: UseQueryStatesOptions,
): unknown {
  if (typeof pathOrDefinition !== 'string') {
    return toQueryStateRef(pathOrDefinition, (codecOrOptions as UseQueryStatesOptions | undefined) ?? {})
  }

  const path = pathOrDefinition

  if (isCodec(codecOrOptions)) {
    return toQueryStateRef(queryParam(path, codecOrOptions), maybeOptions ?? {})
  }

  const { defaultValue, ...navigateOptions } = codecOrOptions ?? {}
  const codec = defaultValue === undefined ? codecs.string : codecs.string.withDefault(defaultValue)

  return toQueryStateRef(queryParam(path, codec), navigateOptions)
}

function toQueryStateRef<TParam extends AnyDefinedQueryParam>(
  definition: TParam,
  options: UseQueryStatesOptions,
): UseQueryStateReturn<TParam> {
  const schema = { value: definition } satisfies SingleParamSchema<TParam>
  const { binding, host } = createQueryBinding(schema, options)

  const valueRef = computed({
    get: () => (binding.read.value as Record<string, unknown>).value,
    set: value => transactQueryKey(binding, 'value', value),
  })

  const queryRef = Object.assign(valueRef, {
    set: (value: unknown, perCall?: QueryWriteOptions) => transactQueryKey(binding, 'value', value, perCall),
    clear: (perCall?: QueryWriteOptions) => transactQueryKey(binding, 'value', undefined, perCall),
  }) as UseQueryStateReturn<TParam>

  queryRef.use = ((module: DefinedQueryStateModule) => {
    applyQueryStateModule(queryRef, host, 'value', module)

    return queryRef
  }) as UseQueryStateReturn<TParam>['use']

  return queryRef
}
