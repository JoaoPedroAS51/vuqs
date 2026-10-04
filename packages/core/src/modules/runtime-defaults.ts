import type { ComputedRef, Ref } from 'vue'
import type { QueryCore } from '../core/module-system/query-core'
import type { QueryStateSchema, QueryStateValueAt, QueryStateValues } from '../core/schema/schema'
import { computed, onScopeDispose, ref } from 'vue'
import { emitDebug, isDebugArmed } from '../core/diagnostics/bus'
import { defineQueryModule } from '../core/module-system/define-query-module'
import { toReadonlyState } from '../shared/to-readonly-state'

declare module '../core/module-system/contract' {
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
 * @see https://vuqs.dev/modules/runtime-defaults
 * @returns A module that contributes {@link RuntimeDefaultsStatesApi} to
 * {@link useQueryStates} and {@link RuntimeDefaultsStateApi} to
 * {@link useQueryState}.
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
      if (isDebugArmed(core.debug)) {
        emitDebug(core.debug, 'rd:set', { defaults: { ...values } })
      }
      provided.value = { ...values }
    },
    clearDefaults: () => {
      emitDebug(core.debug, 'rd:clear')
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
      if (isDebugArmed(core.debug)) {
        emitDebug(core.debug, 'rd:set', { defaults: { [key]: value } })
      }
      provided.value = { [key]: value } as unknown as QueryStateValues<TSchema>
    },
    clearDefault: () => {
      emitDebug(core.debug, 'rd:clear')
      provided.value = {}
    },
  }
}

function useRuntimeDefaultsLayer<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
): Ref<QueryStateValues<TSchema>> {
  const provided = ref<QueryStateValues<TSchema>>({}) as Ref<QueryStateValues<TSchema>>

  const stopLayer = core.defaults.register(provided)
  emitDebug(core.debug, 'rd:register', { state: 'registered' })
  const stopReset = core.hooks.on('context:change', (context) => {
    emitDebug(core.debug, 'rd:reset', { context })
    provided.value = {}
  })
  onScopeDispose(() => {
    emitDebug(core.debug, 'rd:register', { state: 'disposed' })
    stopLayer()
    stopReset()
  })

  return provided
}
