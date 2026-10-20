import type { ComputedRef } from 'vue'
import type { QueryCore } from '../../core/module-system/query-core'
import type { ModuleOptions } from '../../core/module-system/registry'
import type { QueryStateContributions, QueryStateSchema, QueryStateValues } from '../../core/schema/schema'
import { computed } from 'vue'
import { defineQueryModule } from '../../core/module-system/define-query-module'
import { classifyDefault } from '../../core/schema/resolution'

/**
 * Options for {@link withActiveParams} on grouped state.
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
  /** Checks whether `key` is active. Tracks reactively when called inside a reactive effect. */
  isActive: (key: keyof TSchema & string) => boolean
}

/**
 * Single-param API contributed by {@link withActiveParams}.
 */
export interface ActiveParamsStateApi {
  /** Whether the bound param is active. */
  isActive: ComputedRef<boolean>
}

declare module '@vuqs/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- the params must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'vuqs:active-params': {
      states: (options?: ModuleOptions<TOptions, ActiveParamsOptions<TSchema>>) => typeof withActiveParams.definition.states<TSchema>
      state: (options?: undefined) => typeof withActiveParams.definition.state<TSchema>
    }
  }
}

/**
 * Adds reactive activity views for defined explicit values that differ from their
 * composed default candidates or have no candidate.
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
 *
 * @see https://vuqs.dev/modules/active-params
 */
export const withActiveParams = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:active-params',
  states: createActiveParamsStatesSetup,
  state: createActiveParamsStateSetup,
})

function createActiveParamsStatesSetup<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  options: ActiveParamsOptions<TSchema> = {},
): { api: ActiveParamsStatesApi<TSchema> } {
  type Key = keyof TSchema & string

  const keys = Object.keys(core.schema) as Key[]
  const excluded = new Set<Key>(options.exclude ?? [])
  const activeKeys = computed<readonly Key[]>(() => {
    const explicitValues = core.state.explicitValues.value
    const candidates = core.defaults.candidates.value

    return keys.filter(key => !excluded.has(key) && isParamActive(core, key, explicitValues, candidates))
  })
  const activeSet = computed(() => new Set(activeKeys.value))

  return {
    api: {
      activeKeys,
      activeCount: computed(() => activeKeys.value.length),
      hasActive: computed(() => activeKeys.value.length > 0),
      isActive: key => activeSet.value.has(key),
    },
  }
}

function createActiveParamsStateSetup<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
): { api: ActiveParamsStateApi } {
  return {
    api: {
      isActive: computed(() => isParamActive(
        core,
        key,
        core.state.explicitValues.value,
        core.defaults.candidates.value,
      )),
    },
  }
}

function isParamActive<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
  explicitValues: QueryStateValues<TSchema>,
  candidates: QueryStateContributions<TSchema>,
): boolean {
  const classification = classifyDefault(core.schema[key], explicitValues[key], candidates[key])

  return classification === 'different' || classification === 'no-default'
}
