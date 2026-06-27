import type { ComputedRef, Ref } from 'vue'
import type { QUERY_STATE_MODULE, QUERY_STATE_MODULE_API, QueryModule, QueryStateModuleApiKind } from '../core/module'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema, QueryStateValueOf, QueryStateValues } from '../core/schema'
import { computed, onScopeDispose, ref } from 'vue'
import { defineQueryModule } from '../core/module'
import { toReadonlyState } from '../shared'

/**
 * API contributed by {@link withRuntimeDefaults}.
 *
 * @remarks
 * `selected` exposes the explicit URL selection and `defaults` the fallback
 * values. The module also registers those defaults as a layer, so the bound
 * `values` from {@link useQueryStates} resolve over them, making `values` the
 * effective read.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface RuntimeDefaultsApi<TSchema extends QueryStateSchema> {
  /** Explicit URL selections, with no runtime or codec defaults. */
  selected: Readonly<QueryStateValues<TSchema>>
  /** Fallback values: runtime defaults from `setDefaults` over codec defaults. */
  defaults: Readonly<QueryStateValues<TSchema>>
  /** Replaces runtime defaults with a snapshot. */
  setDefaults: (values: QueryStateValues<TSchema>) => void
  /** Removes runtime defaults, leaving codec defaults in place. */
  clearDefaults: () => void
}

/**
 * Single-param API contributed by {@link withRuntimeDefaults}.
 *
 * @remarks
 * `selectedValue` exposes the explicit URL selection and `defaultValue` the
 * fallback value. The base ref's `.value` remains the effective read: selection
 * over runtime default over codec default.
 *
 * @typeParam TSchema - The schema being managed.
 * @typeParam TKey - The param key this single API is bound to.
 */
export interface RuntimeDefaultsStateApi<
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string = keyof TSchema & string,
> {
  /** Explicit URL selection for this param, with no runtime or codec defaults. */
  selectedValue: ComputedRef<QueryStateValueAt<TSchema, TKey> | undefined>
  /** Fallback value for this param: runtime default over codec default. */
  defaultValue: ComputedRef<QueryStateValueAt<TSchema, TKey> | undefined>
  /** Replaces the runtime default for this param. */
  setDefault: (value: QueryStateValueAt<TSchema, TKey>) => void
  /** Removes the runtime default for this param, leaving its codec default in place. */
  clearDefault: () => void
}

type QueryStateValueAt<
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
> = TSchema extends { [Key in TKey]: infer TDefinition }
  ? QueryStateValueOf<TDefinition>
  : never

type RuntimeDefaultsQueryStatesModule = <TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
) => RuntimeDefaultsApi<TSchema>

type RuntimeDefaultsQueryStateModule = <
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(
  core: QueryCore<TSchema>,
  key: TKey,
) => RuntimeDefaultsStateApi<TSchema, TKey>

interface RuntimeDefaultsQueryStateApiKind extends QueryStateModuleApiKind {
  readonly api: RuntimeDefaultsStateApi<
    this['schema'],
    Extract<this['key'], keyof this['schema'] & string>
  >
}

type RuntimeDefaultsModule = RuntimeDefaultsQueryStatesModule & {
  readonly [QUERY_STATE_MODULE]: RuntimeDefaultsQueryStateModule
  readonly [QUERY_STATE_MODULE_API]: RuntimeDefaultsQueryStateApiKind
}

/**
 * Creates a module that layers runtime defaults under the bound query state.
 *
 * @remarks
 * The module registers the `setDefaults` snapshot as a default layer over the
 * codec defaults, so `values` resolve as the selection over the runtime default
 * over the codec default. Explicit URL selections override both. It also exposes
 * `selected` (the selection alone) and `defaults` (the merged fallback values).
 *
 * Pipeline `read` transforms apply to `selected`, `defaults`, and the resolved
 * `values`. Runtime defaults reset on the `'context:change'` hook, so pairing
 * this module with {@link withContext} clears stale per-context defaults without
 * direct coupling.
 *
 * @returns A query module that contributes {@link RuntimeDefaultsApi} to
 * {@link useQueryStates} and {@link RuntimeDefaultsStateApi} to
 * {@link useQueryState}.
 *
 * @example
 * ```ts
 * const { values, setDefaults } = useQueryStates(schema)
 *   .use(withRuntimeDefaults())
 *
 * setDefaults(await loadSavedPreferences())
 * values.currency // selection over the runtime default over the codec default
 * ```
 */
export function withRuntimeDefaults<TSchema extends QueryStateSchema>(): QueryModule<TSchema, RuntimeDefaultsApi<TSchema>> & {
  readonly [QUERY_STATE_MODULE]: RuntimeDefaultsQueryStateModule
  readonly [QUERY_STATE_MODULE_API]: RuntimeDefaultsQueryStateApiKind
}
export function withRuntimeDefaults(): RuntimeDefaultsModule {
  return defineQueryModule({
    queryStates: createRuntimeDefaultsApi,
    queryState: createRuntimeDefaultsStateApi,
  }) as RuntimeDefaultsModule
}

function createRuntimeDefaultsApi<TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): RuntimeDefaultsApi<TSchema> {
  const provided = useRuntimeDefaultsLayer(core)

  return {
    selected: toReadonlyState(core.state.selected),
    defaults: toReadonlyState(core.defaults.resolved),
    setDefaults: (values) => {
      provided.value = { ...values }
    },
    clearDefaults: () => {
      provided.value = {}
    },
  }
}

function createRuntimeDefaultsStateApi<
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(core: QueryCore<TSchema>, key: TKey): RuntimeDefaultsStateApi<TSchema, TKey> {
  const provided = useRuntimeDefaultsLayer(core)

  return {
    selectedValue: computed(() => core.state.selected.value[key]),
    defaultValue: computed(() => core.defaults.resolved.value[key]),
    setDefault: (value) => {
      provided.value = { [key]: value } as unknown as QueryStateValues<TSchema>
    },
    clearDefault: () => {
      provided.value = {}
    },
  }
}

function useRuntimeDefaultsLayer<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
): Ref<QueryStateValues<TSchema>> {
  const provided = ref<QueryStateValues<TSchema>>({}) as Ref<QueryStateValues<TSchema>>

  const stopLayer = core.defaults.register(provided)
  const stopReset = core.hooks.on('context:change', () => {
    provided.value = {}
  })
  onScopeDispose(() => {
    stopLayer()
    stopReset()
  })

  return provided
}
