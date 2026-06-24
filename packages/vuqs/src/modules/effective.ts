import type { QueryStateSchema, QueryStateValues } from '../core/schema'
import type { QueryCore } from '../core/use-query-states'
import { computed, onScopeDispose, ref } from 'vue'
import { definedOnly, toReadonlyState } from '../shared'

/**
 * API contributed by {@link withEffective}.
 *
 * @remarks
 * `selected` stores explicit URL selections, `defaults` stores fallback values,
 * and `effective` is the read model layered from both.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface EffectiveApi<TSchema extends QueryStateSchema> {
  /** Explicit URL selections, with no runtime or codec defaults. */
  selected: Readonly<QueryStateValues<TSchema>>
  /** Fallback values: runtime defaults from `setDefaults` over codec defaults. */
  defaults: Readonly<QueryStateValues<TSchema>>
  /** The resolved read model: `selected` layered over `defaults`. */
  effective: Readonly<QueryStateValues<TSchema>>
  /** Replaces runtime defaults with a snapshot. */
  setDefaults: (values: QueryStateValues<TSchema>) => void
  /** Removes runtime defaults, leaving codec defaults in place. */
  clearDefaults: () => void
}

/**
 * Creates a module that separates selected, default, and effective state.
 *
 * @remarks
 * The module derives `selected` from explicit URL selections, `defaults` from
 * codec defaults layered with runtime defaults, and `effective` from `selected`
 * layered over `defaults`.
 *
 * Runtime defaults from `setDefaults` override codec defaults. Explicit URL
 * selections override both. A field with neither falls back to its codec default
 * when one exists.
 *
 * Pipeline `read` transforms apply to all three states. Runtime defaults reset
 * on the `'context:change'` hook, so pairing this module with {@link withContext}
 * clears stale per-context defaults without direct coupling.
 *
 * @returns A query module that contributes {@link EffectiveApi}.
 *
 * @example
 * ```ts
 * const { effective, setDefaults } = useQueryStates(schema, { query, navigate })
 *   .use(withEffective())
 *
 * setDefaults(await loadSavedPreferences())
 * effective.currency // selection over the runtime default over the codec default
 * ```
 */
export function withEffective(): <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => EffectiveApi<TSchema> {
  return <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): EffectiveApi<TSchema> => {
    const provided = ref<QueryStateValues<TSchema>>({})

    const codecDefaults: Record<string, unknown> = {}
    for (const key of Object.keys(core.schema) as Array<keyof TSchema & string>) {
      const value = core.schema[key].defaultValue
      if (value !== undefined) {
        codecDefaults[key] = value
      }
    }

    const selected = computed<QueryStateValues<TSchema>>(() => definedOnly(core.selected.value))
    const defaults = computed<QueryStateValues<TSchema>>(
      () => core.pipeline.run('read', { ...codecDefaults, ...definedOnly(provided.value) }) as QueryStateValues<TSchema>,
    )
    const effective = computed<QueryStateValues<TSchema>>(
      () => ({ ...defaults.value, ...selected.value }) as QueryStateValues<TSchema>,
    )

    const stopReset = core.hooks.on('context:change', () => {
      provided.value = {}
    })
    onScopeDispose(stopReset)

    return {
      selected: toReadonlyState(selected),
      defaults: toReadonlyState(defaults),
      effective: toReadonlyState(effective),
      setDefaults: (values) => {
        provided.value = { ...values }
      },
      clearDefaults: () => {
        provided.value = {}
      },
    }
  }
}
