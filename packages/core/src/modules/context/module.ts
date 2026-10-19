import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryCore } from '../../core/module-system/query-core'
import type { ModuleOptions } from '../../core/module-system/registry'
import type { ParsedQuery, ParsedQueryRaw } from '../../core/query/types'
import type { NavigateOptions } from '../../core/runtime/adapter'
import type { PipelineDescriptor, ReadProjection } from '../../core/runtime/pipeline/contract'
import type { QueryStateSchema, QueryStateValues } from '../../core/schema/schema'
// Anchor the registry augmentation to the core entry
import type {} from '../../index'
import { computed, toValue, watch } from 'vue'
import { emitDebug, isDebugArmed } from '../../core/diagnostics/bus'
import { defineQueryModule } from '../../core/module-system/define-query-module'
import { dropDefaults } from '../../core/schema/default-elision'
import { buildQuery, parseQueryStates } from '../../core/schema/operations'
import { pickBy } from '../../shared/utils/object'

declare module '@vuqs/core' {
  interface QueryHooks {
    /** Published by {@link withContext} when the active context changes. */
    'context:change': (context: string) => void
  }
}

declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'vuqs:context': {
      states: (
        options: ModuleOptions<TOptions, GroupedContextOptionsFromActive<TSchema, TInference>>,
      ) => typeof withContext.definition.states<TSchema, typeof options>
      state: (
        options: ModuleOptions<TOptions, SingleContextOptionsFromActive<TInference>>,
      ) => typeof withContext.definition.state<TSchema, typeof options>
    }
  }
}

/**
 * The union of context identifiers an `active` option carries.
 *
 * @typeParam TOptions - The options passed to {@link withContext}.
 */
export type ContextOf<TOptions> = TOptions extends { active: MaybeRefOrGetter<infer TContext extends string> }
  ? TContext
  : string

type ContextFromActive<TActive> = TActive extends MaybeRefOrGetter<infer TContext extends string>
  ? TContext
  : string

type WithActiveSource<TOptions, TActive> = TOptions extends unknown
  ? Omit<TOptions, 'active'> & { active: TActive & MaybeRefOrGetter<string> }
  : never

type GroupedContextOptionsFromActive<TSchema extends QueryStateSchema, TActive> = WithActiveSource<
  QueryStatesContextOptions<TSchema, ContextFromActive<TActive>>,
  TActive
>

type SingleContextOptionsFromActive<TActive> = WithActiveSource<
  QueryStateContextOptions<ContextFromActive<TActive>>,
  TActive
>

type RestrictedKeys<TOptions> = TOptions extends { only: infer TOnly extends object }
  ? Extract<keyof TOnly, string>
  : never

type RestrictedPaths<TKey extends string> = [TKey] extends [never] ? readonly [] : readonly [[TKey]]

type ContextRead<TKey extends string, TProjection extends ReadProjection>
  = PipelineDescriptor<'read', TProjection, RestrictedPaths<TKey>, readonly [], 'default'>

/** The descriptors {@link withContext} contributes: its filter on every read projection and on writes. */
export type ContextPipeline<TKey extends string> = readonly [
  ContextRead<TKey, 'explicit'>,
  ContextRead<TKey, 'defaults'>,
  ContextRead<TKey, 'resolved'>,
  PipelineDescriptor<'write', undefined, RestrictedPaths<TKey>, readonly [], 'default'>,
]

/**
 * Shared navigation function used by {@link withContext}.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export type ContextNavigate<TContext extends string> = (
  target: TContext,
  query: ParsedQueryRaw,
  options?: NavigateOptions,
) => void

/**
 * Base options shared by grouped and single-param context modules.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export interface ContextBaseOptions<TContext extends string> {
  /** The active context supplied as a ref, getter, or plain value. */
  active: MaybeRefOrGetter<TContext>
  /**
   * Navigates to the supplied context with its reconciled query and navigation options.
   * Required by `switchTo`.
   */
  navigate?: ContextNavigate<TContext>
}

/**
 * Grouped options for {@link withContext}.
 *
 * @typeParam TSchema - The schema whose param names key `preserve` and `only`.
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStatesContextOptions<TSchema extends QueryStateSchema, TContext extends string>
  = ContextBaseOptions<TContext> & (
    | { preserve?: undefined, only?: undefined }
    | {
      /** Params whose explicit values are preserved when valid in the target context; other managed params are cleared. */
      preserve: ReadonlyArray<keyof TSchema & string>
      /** Per-param validity: the contexts a param exists in. Omit a param to make it valid everywhere. */
      only?: Partial<Record<keyof TSchema & string, readonly TContext[]>>
    }
    | {
      /** Params whose explicit values are preserved when valid in the target context; other managed params are cleared. */
      preserve?: ReadonlyArray<keyof TSchema & string>
      /** Per-param validity: the contexts a param exists in. Omit a param to make it valid everywhere. */
      only: Partial<Record<keyof TSchema & string, readonly TContext[]>>
    }
  )

/**
 * Single-param options for {@link withContext}.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStateContextOptions<TContext extends string> = ContextBaseOptions<TContext> & (
  | { preserve?: undefined, only?: undefined }
  | {
    /** Whether this param's explicit value is preserved when valid in the target context. */
    preserve: boolean
    /** The contexts this param exists in. Omit to make it valid everywhere. */
    only?: readonly TContext[]
  }
  | {
    /** Whether this param's explicit value is preserved when valid in the target context. */
    preserve?: boolean
    /** The contexts this param exists in. Omit to make it valid everywhere. */
    only: readonly TContext[]
  }
)

interface ResolvedContextOptions<TSchema extends QueryStateSchema, TContext extends string> extends ContextBaseOptions<TContext> {
  isPreserved: (key: keyof TSchema & string) => boolean
  isValidIn: (key: keyof TSchema & string, context: TContext) => boolean
}

/**
 * Grouped API contributed by {@link withContext}.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export interface ContextStatesApi<TContext extends string> extends ContextControls<TContext> {}

/**
 * Single-param API contributed by {@link withContext}.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export interface ContextStateApi<TContext extends string> extends ContextControls<TContext> {}

interface ContextControls<TContext extends string> {
  /** The active context. */
  activeContext: ComputedRef<TContext>
  /**
   * Builds a query for `nextContext` without navigating.
   *
   * @returns A query retaining unmanaged params and preserved values valid
   * in the target context, with the remaining managed params removed.
   */
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
  /**
   * Calls the supplied `navigate` callback with `target` and its reconciled query.
   *
   * @throws {Error} When `navigate` was not provided.
   */
  switchTo: (target: TContext, options?: NavigateOptions) => void
}

/**
 * Creates a context module that binds to whichever facade composes it.
 *
 * @example
 * ```ts
 * const { switchTo } = useQueryStates(schema)
 *   .use(withContext({
 *     active: () => route.name as 'products' | 'orders',
 *     preserve: ['q'],
 *     only: { category: ['products'] },
 *     navigate: (target, query) => navigateTo({ name: target, query }),
 *   }))
 *
 * switchTo('orders') // preserves q and clears category
 * ```
 *
 * @see https://vuqs.dev/modules/context
 */
export const withContext = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:context',
  states: <TSchema extends QueryStateSchema, const TOptions>(
    core: QueryCore<TSchema>,
    options: TOptions & QueryStatesContextOptions<TSchema, string>,
  ): { api: ContextStatesApi<ContextOf<TOptions>>, pipeline: ContextPipeline<RestrictedKeys<TOptions>> } => {
    const resolved = resolveQueryStatesContextOptions<TSchema, ContextOf<TOptions>>(
      options as QueryStatesContextOptions<TSchema, ContextOf<TOptions>>,
    )

    return {
      api: createContextControls(core, resolved),
      pipeline: declareContextFilters<RestrictedKeys<TOptions>, TSchema, ContextOf<TOptions>>(core, resolved, Object.keys(options.only ?? {})),
    }
  },
  state: <TSchema extends QueryStateSchema, const TOptions>(
    core: QueryCore<TSchema>,
    key: keyof TSchema & string,
    options: TOptions & QueryStateContextOptions<string>,
  ): { api: ContextStateApi<ContextOf<TOptions>>, pipeline: ContextPipeline<TOptions extends { only: unknown } ? 'value' : never> } => {
    const resolved = resolveQueryStateContextOptions<TSchema, ContextOf<TOptions>>(
      options as QueryStateContextOptions<ContextOf<TOptions>>,
    )

    return {
      api: createContextControls(core, resolved, key),
      pipeline: declareContextFilters<TOptions extends { only: unknown } ? 'value' : never, TSchema, ContextOf<TOptions>>(
        core,
        resolved,
        options.only === undefined ? [] : ['value'],
      ),
    }
  },
})

function declareContextFilters<TKey extends string, TSchema extends QueryStateSchema, TContext extends string>(
  core: QueryCore<TSchema>,
  options: ResolvedContextOptions<TSchema, TContext>,
  restricted: readonly string[],
): ContextPipeline<TKey> {
  const active = computed(() => toValue(options.active))
  const filter = pickBy(paramKey => options.isValidIn(paramKey as keyof TSchema & string, active.value))
  const presence = { optional: restricted.map(key => [key]) }
  // Typed by the module's registry signature, which states the effects it contributes.
  const define = core.pipeline.define as (...args: unknown[]) => unknown

  return [
    define('read', filter, { projection: 'explicit', presence }),
    define('read', filter, { projection: 'defaults', presence }),
    define('read', filter, { projection: 'resolved', presence }),
    define('write', filter, { presence }),
  ] as ContextPipeline<TKey>
}

function createContextControls<TSchema extends QueryStateSchema, TContext extends string>(
  core: QueryCore<TSchema>,
  options: ResolvedContextOptions<TSchema, TContext>,
  key?: keyof TSchema & string,
): ContextControls<TContext> {
  const active = computed(() => toValue(options.active))
  const contextKeys = key === undefined ? Object.keys(core.schema) as Array<keyof TSchema & string> : [key]

  const build = (currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw => {
    const parsed = parseQueryStates(core.schema, currentQuery) as Record<string, unknown>
    const kept: Record<string, unknown> = {}

    for (const paramKey of contextKeys) {
      if (
        options.isPreserved(paramKey)
        && parsed[paramKey] !== undefined
        && options.isValidIn(paramKey, nextContext)
      ) {
        kept[paramKey] = parsed[paramKey]
      }
    }

    const values = kept as QueryStateValues<TSchema>

    return buildQuery(core.schema, currentQuery, dropDefaults(core.schema, values))
  }

  const keptContextKeys = (currentQuery: ParsedQuery, nextContext: TContext): string[] => {
    const parsed = parseQueryStates(core.schema, currentQuery) as Record<string, unknown>

    return contextKeys.filter(paramKey =>
      options.isPreserved(paramKey)
      && parsed[paramKey] !== undefined
      && options.isValidIn(paramKey, nextContext),
    )
  }

  const buildContextQuery = (currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw => {
    // Avoid diagnostic-only query analysis when unobserved.
    if (isDebugArmed(core.debug)) {
      const kept = keptContextKeys(currentQuery, nextContext)
      emitDebug(core.debug, 'ctx:build', { kept, dropped: contextKeys.filter(paramKey => !kept.includes(paramKey)) })
    }
    return build(currentQuery, nextContext)
  }

  const switchTo = (target: TContext, navigateOptions?: NavigateOptions): void => {
    if (!options.navigate) {
      throw new Error('[vuqs] withContext: provide a `navigate` option to use switchTo()')
    }

    emitDebug(core.debug, 'ctx:switch', { to: String(target) })
    options.navigate(target, buildContextQuery(core.query.current(), target), navigateOptions)
  }

  watch(active, (nextContext) => {
    // Avoid diagnostic-only partitioning when unobserved; context hooks still run.
    if (isDebugArmed(core.debug)) {
      const valid: string[] = []
      const invalid: string[] = []
      for (const paramKey of contextKeys) {
        (options.isValidIn(paramKey, nextContext) ? valid : invalid).push(paramKey)
      }
      emitDebug(core.debug, 'ctx:change', { context: String(nextContext), valid, invalid })
    }
    core.hooks.emit('context:change', nextContext)
  })

  return {
    activeContext: active,
    buildContextQuery,
    switchTo,
  }
}

function resolveQueryStatesContextOptions<TSchema extends QueryStateSchema, TContext extends string>(
  options: QueryStatesContextOptions<TSchema, TContext>,
): ResolvedContextOptions<TSchema, TContext> {
  return {
    active: options.active,
    navigate: options.navigate,
    isPreserved: key => options.preserve?.includes(key) ?? false,
    isValidIn: (key, context) => {
      const contexts = options.only?.[key]

      return contexts === undefined || contexts.includes(context)
    },
  }
}

function resolveQueryStateContextOptions<TSchema extends QueryStateSchema, TContext extends string>(
  options: QueryStateContextOptions<TContext>,
): ResolvedContextOptions<TSchema, TContext> {
  return {
    active: options.active,
    navigate: options.navigate,
    isPreserved: () => options.preserve === true,
    isValidIn: (_key, context) => options.only === undefined || options.only.includes(context),
  }
}
