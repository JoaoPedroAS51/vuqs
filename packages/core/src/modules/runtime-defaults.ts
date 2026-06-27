import type { Ref } from 'vue'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema, QueryStateValues } from '../core/schema'
import { onScopeDispose, ref } from 'vue'
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
 * @returns A query module that contributes {@link RuntimeDefaultsApi}.
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
export function withRuntimeDefaults(): <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => RuntimeDefaultsApi<TSchema> {
  return <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): RuntimeDefaultsApi<TSchema> => {
    const provided = ref<QueryStateValues<TSchema>>({}) as Ref<QueryStateValues<TSchema>>

    const stopLayer = core.defaults.register(provided)
    const stopReset = core.hooks.on('context:change', () => {
      provided.value = {}
    })
    onScopeDispose(() => {
      stopLayer()
      stopReset()
    })

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
}
