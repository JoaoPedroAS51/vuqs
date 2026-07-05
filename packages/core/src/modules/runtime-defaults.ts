import type { ComputedRef, Ref } from 'vue'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema, QueryStateValueAt, QueryStateValues } from '../core/schema'
import { computed, onScopeDispose, ref } from 'vue'
import { debug } from '../core/debug/sink'
import { defineQueryModule } from '../core/module'
import { toReadonlyState } from '../shared'

declare module '../core/module' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TParam must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'vuqs:runtime-defaults': {
      states: { api: RuntimeDefaultsStatesApi<TSchema> }
      state: { api: RuntimeDefaultsStateApi<QueryStateValueAt<TSchema, 'value'>> }
    }
  }
}

/**
 * Grouped API contributed by {@link withRuntimeDefaults}.
 *
 * @remarks
 * `selected` exposes the explicit URL selection and `defaults` the fallback
 * values. The module also registers those defaults as a layer, so the bound
 * `values` from {@link useQueryStates} resolve over them, making `values` the
 * effective read.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface RuntimeDefaultsStatesApi<TSchema extends QueryStateSchema> {
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
 * @typeParam TValue - The bound param's value type.
 */
export interface RuntimeDefaultsStateApi<TValue> {
  /** Explicit URL selection for this param, with no runtime or codec defaults. */
  selectedValue: ComputedRef<TValue | undefined>
  /** Fallback value for this param: runtime default over codec default. */
  defaultValue: ComputedRef<TValue | undefined>
  /** Replaces the runtime default for this param. */
  setDefault: (value: TValue) => void
  /** Removes the runtime default for this param, leaving its codec default in place. */
  clearDefault: () => void
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
 * @returns A module that contributes {@link RuntimeDefaultsStatesApi} to
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
export const withRuntimeDefaults = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:runtime-defaults',
  queryStates: createRuntimeDefaultsStatesApi,
  queryState: createRuntimeDefaultsStateApi,
})

function createRuntimeDefaultsStatesApi<TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): RuntimeDefaultsStatesApi<TSchema> {
  const provided = useRuntimeDefaultsLayer(core)

  return {
    selected: toReadonlyState(core.state.selected),
    defaults: toReadonlyState(core.defaults.resolved),
    setDefaults: (values) => {
      debug('rd:set', { ...values })
      provided.value = { ...values }
    },
    clearDefaults: () => {
      debug('rd:clear')
      provided.value = {}
    },
  }
}

function createRuntimeDefaultsStateApi<
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(core: QueryCore<TSchema>, key: TKey): RuntimeDefaultsStateApi<QueryStateValueAt<TSchema, TKey>> {
  const provided = useRuntimeDefaultsLayer(core)

  return {
    selectedValue: computed(() => core.state.selected.value[key] as QueryStateValueAt<TSchema, TKey> | undefined),
    defaultValue: computed(() => core.defaults.resolved.value[key] as QueryStateValueAt<TSchema, TKey> | undefined),
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
  debug('rd:register', 'registered')
  const stopReset = core.hooks.on('context:change', (context) => {
    debug('rd:reset', context)
    provided.value = {}
  })
  onScopeDispose(() => {
    debug('rd:register', 'disposed')
    stopLayer()
    stopReset()
  })

  return provided
}
