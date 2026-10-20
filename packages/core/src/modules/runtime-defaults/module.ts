import type { ComputedRef, Ref } from 'vue'
import type { QueryCore } from '../../core/module-system/query-core'
import type { QueryStateContributionAt, QueryStateContributions, QueryStateSchema, QueryStateValueAt, QueryStateValues } from '../../core/schema/schema'
import { computed, onScopeDispose, ref } from 'vue'
import { emitDebug, isDebugArmed } from '../../core/diagnostics/bus'
import { defineQueryModule } from '../../core/module-system/define-query-module'
import { toReadonlyState } from '../../shared/to-readonly-state'

declare module '@vuqs/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TOptions must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'vuqs:runtime-defaults': {
      states: (options?: undefined) => typeof withRuntimeDefaults.definition.states<TSchema>
      state: (options?: undefined) => typeof withRuntimeDefaults.definition.state<TSchema>
    }
  }
}

/**
 * Grouped API contributed by {@link withRuntimeDefaults}.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface RuntimeDefaultsStatesApi<TSchema extends QueryStateSchema> {
  /** Explicit param values, including optimistic writes and the read pipeline, before engine default resolution. */
  explicitValues: Readonly<QueryStateValues<TSchema>>
  /** Composed default candidates from static and runtime sources, with the default read projection applied. */
  defaults: Readonly<QueryStateContributions<TSchema>>
  /** Replaces this module's default contribution; omitted or `undefined` paths keep lower defaults. */
  setDefaults: (values: QueryStateContributions<TSchema>) => void
  /** Empties this module's default contribution, revealing lower defaults. */
  clearDefaults: () => void
}

/**
 * Single-param API contributed by {@link withRuntimeDefaults}.
 *
 * @typeParam TExplicit - The bound param's explicit value type.
 * @typeParam TContribution - The bound param's default contribution type.
 */
export interface RuntimeDefaultsStateApi<TExplicit, TContribution = TExplicit> {
  /** Explicit param value, including optimistic writes and the read pipeline, before engine default resolution. */
  explicitValue: ComputedRef<TExplicit | undefined>
  /** This param's composed default candidate, with the default read projection applied. */
  defaultValue: ComputedRef<TContribution | undefined>
  /** Replaces this module's default contribution for the bound param. */
  setDefault: (value: TContribution) => void
  /** Empties this module's default contribution for the bound param, revealing lower defaults. */
  clearDefault: () => void
}

/**
 * Creates a module that layers runtime defaults under the bound query state.
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
 * values.currency // explicit value over the runtime default over the static default
 * ```
 *
 * @see https://vuqs.dev/modules/runtime-defaults
 */
export const withRuntimeDefaults = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:runtime-defaults',
  states: createRuntimeDefaultsStatesSetup,
  state: createRuntimeDefaultsStateSetup,
})

function createRuntimeDefaultsStatesSetup<TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): {
  api: RuntimeDefaultsStatesApi<TSchema>
  defaults: [Ref<QueryStateContributions<TSchema>>]
} {
  const provided = useRuntimeDefaultsSource(core)

  return {
    api: {
      explicitValues: toReadonlyState(core.state.explicitValues),
      defaults: toReadonlyState(core.defaults.candidates),
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
    },
    defaults: [provided],
  }
}

function createRuntimeDefaultsStateSetup<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
): {
  api: RuntimeDefaultsStateApi<QueryStateValueAt<TSchema, 'value'>, QueryStateContributionAt<TSchema, 'value'>>
  defaults: [Ref<QueryStateContributions<TSchema>>]
} {
  const provided = useRuntimeDefaultsSource(core)

  return {
    api: {
      explicitValue: computed(() => core.state.explicitValues.value[key] as QueryStateValueAt<TSchema, 'value'> | undefined),
      defaultValue: computed(() => core.defaults.candidates.value[key] as QueryStateContributionAt<TSchema, 'value'> | undefined),
      setDefault: (value) => {
        if (isDebugArmed(core.debug)) {
          emitDebug(core.debug, 'rd:set', { defaults: { [key]: value } })
        }
        const defaults: QueryStateContributions<TSchema> = {}
        defaults[key] = value
        provided.value = defaults
      },
      clearDefault: () => {
        emitDebug(core.debug, 'rd:clear')
        provided.value = {}
      },
    },
    defaults: [provided],
  }
}

// One source per module instance: its contribution is replaced or emptied in place, so its
// precedence position never changes. A context change empties only this instance.
function useRuntimeDefaultsSource<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
): Ref<QueryStateContributions<TSchema>> {
  const provided = ref<QueryStateContributions<TSchema>>({}) as Ref<QueryStateContributions<TSchema>>

  emitDebug(core.debug, 'rd:register', { state: 'registered' })
  core.hooks.on('context:change', (context) => {
    emitDebug(core.debug, 'rd:reset', { context })
    provided.value = {}
  })
  onScopeDispose(() => {
    emitDebug(core.debug, 'rd:register', { state: 'disposed' })
  })

  return provided
}
