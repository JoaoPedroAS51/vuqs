import type { ComputedRef } from 'vue'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema, QueryStateValues } from '../core/schema'
import { computed } from 'vue'
import { defineQueryModule } from '../core/module'

/**
 * Options for the grouped {@link withActiveParams} projection.
 *
 * @typeParam TSchema - The schema whose param names can be excluded.
 */
export interface ActiveParamsOptions<TSchema extends QueryStateSchema> {
  /** Params omitted from every active-param view. Captured when the module is composed. */
  exclude?: readonly (keyof TSchema & string)[]
}

/**
 * Grouped API contributed by {@link withActiveParams}.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface ActiveParamsStatesApi<TSchema extends QueryStateSchema> {
  /** Active param names, kept in schema order. */
  activeKeys: ComputedRef<readonly (keyof TSchema & string)[]>
  /** Number of active params. */
  activeCount: ComputedRef<number>
  /** Whether at least one param is active. */
  hasActive: ComputedRef<boolean>
  /** Returns whether `key` is active. Tracks reactively when called inside a reactive effect. */
  isActive: (key: keyof TSchema & string) => boolean
}

/**
 * Single-param API contributed by {@link withActiveParams}.
 */
export interface ActiveParamsStateApi {
  /** Whether the bound param is active. */
  isActive: ComputedRef<boolean>
}

declare module '../core/module' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TParam must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'vuqs:active-params': {
      states: {
        options: ActiveParamsOptions<TSchema>
        api: ActiveParamsStatesApi<TSchema>
      }
      state: { api: ActiveParamsStateApi }
    }
  }
}

/**
 * Adds reactive views over params explicitly selected away from their resolved defaults.
 *
 * @remarks
 * A param is active when it is present in `core.state.selected` and either has no
 * resolved default or differs from that default according to the param's equality
 * function. Grouped composition can exclude schema keys from every view. The module
 * is read-only and registers no hooks, transforms, or default layers.
 *
 * @returns A module that contributes {@link ActiveParamsStatesApi} to
 * {@link useQueryStates} and {@link ActiveParamsStateApi} to {@link useQueryState}.
 *
 * @example
 * ```ts
 * const query = useQueryStates(schema)
 *   .use(withActiveParams({ exclude: ['page'] }))
 *
 * query.activeCount.value
 * query.isActive('status')
 * ```
 */
export const withActiveParams = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:active-params',
  queryStates: createActiveParamsStatesApi,
  queryState: createActiveParamsStateApi,
})

function createActiveParamsStatesApi<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  options: ActiveParamsOptions<TSchema> = {},
): ActiveParamsStatesApi<TSchema> {
  type Key = keyof TSchema & string

  const keys = Object.keys(core.schema) as Key[]
  const excluded = new Set<Key>(options.exclude ?? [])
  const activeKeys = computed<readonly Key[]>(() => {
    const selected = core.state.selected.value
    const defaults = core.defaults.resolved.value

    return keys.filter(key => !excluded.has(key) && isParamActive(core, key, selected, defaults))
  })
  const activeSet = computed(() => new Set(activeKeys.value))

  return {
    activeKeys,
    activeCount: computed(() => activeKeys.value.length),
    hasActive: computed(() => activeKeys.value.length > 0),
    isActive: key => activeSet.value.has(key),
  }
}

function createActiveParamsStateApi<
  TSchema extends QueryStateSchema,
  TKey extends keyof TSchema & string,
>(core: QueryCore<TSchema>, key: TKey): ActiveParamsStateApi {
  return {
    isActive: computed(() => isParamActive(
      core,
      key,
      core.state.selected.value,
      core.defaults.resolved.value,
    )),
  }
}

function isParamActive<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
  selected: QueryStateValues<TSchema>,
  defaults: QueryStateValues<TSchema>,
): boolean {
  if (!Object.hasOwn(selected, key)) {
    return false
  }

  if (!Object.hasOwn(defaults, key)) {
    return true
  }

  return !core.schema[key].eq(selected[key], defaults[key])
}
