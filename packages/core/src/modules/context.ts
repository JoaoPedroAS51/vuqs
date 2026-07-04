import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema, QueryStateValues } from '../core/schema'
import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../core/types'
import { computed, onScopeDispose, toValue, watch } from 'vue'
import { defineQueryModule } from '../core/module'
import { buildQuery, dropDefaults, parseQueryStates } from '../core/schema'
import { pickBy } from '../shared'

declare module '@vuqs/core' {
  interface QueryHooks {
    /** Published by {@link withContext} when the active context changes. */
    'context:change': (context: string) => void
  }
}

declare module '../core/module' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'vuqs:context': {
      states: {
        options: QueryStatesContextOptions<TSchema, TParam>
        api: ContextStatesApi<TParam>
      }
      state: {
        options: QueryStateContextOptions<TParam>
        api: ContextStateApi<TParam>
      }
    }
  }
}

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
  /** The active context as a ref, getter, or plain value. The module never derives it. */
  active: MaybeRefOrGetter<TContext>
  /**
   * How to navigate to a context. The module reconciles the query and passes it
   * here with the target context, so the consumer issues one navigation that
   * carries both the path and the query. Required to call `switchTo`.
   */
  navigate?: ContextNavigate<TContext>
}

/**
 * Grouped options for {@link withContext}.
 *
 * @remarks
 * `preserve` and `only` are keyed by schema param names. Omitting both selects
 * the base form (active context only). These options apply on
 * {@link useQueryStates}, either inferred from the composable schema or checked
 * against the schema passed to {@link withContext}.
 *
 * @typeParam TSchema - The schema whose param names key `preserve` and `only`.
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStatesContextOptions<TSchema extends QueryStateSchema, TContext extends string>
  = ContextBaseOptions<TContext> & (
    | { preserve?: undefined, only?: undefined }
    | {
      /** Params kept across a context change; everything else resets. */
      preserve: ReadonlyArray<keyof TSchema & string>
      /** Per-param validity: the contexts a param exists in. Omit a param to make it valid everywhere. */
      only?: Partial<Record<keyof TSchema & string, readonly TContext[]>>
    }
    | {
      /** Params kept across a context change; everything else resets. */
      preserve?: ReadonlyArray<keyof TSchema & string>
      /** Per-param validity: the contexts a param exists in. Omit a param to make it valid everywhere. */
      only: Partial<Record<keyof TSchema & string, readonly TContext[]>>
    }
  )

/**
 * Single-param options for {@link withContext}.
 *
 * @remarks
 * `preserve` and `only` describe the one param bound by {@link useQueryState}.
 * Omitting both selects the base form (active context only).
 *
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStateContextOptions<TContext extends string> = ContextBaseOptions<TContext> & (
  | { preserve?: undefined, only?: undefined }
  | {
    /** Whether this param is kept across a context change when valid in the target. */
    preserve: boolean
    /** The contexts this param exists in. Omit to make it valid everywhere. */
    only?: readonly TContext[]
  }
  | {
    /** Whether this param is kept across a context change when valid in the target. */
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
   * Builds the reconciled query for switching to `nextContext` without
   * navigating: preserved params valid in the target are kept, everything else
   * is dropped. Use it to render a link or for SSR.
   */
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
  /**
   * Switches to `target` in one navigation: reconciles the query and hands it to
   * the `navigate` option. Throws if `navigate` was not provided.
   */
  switchTo: (target: TContext, options?: NavigateOptions) => void
}

/**
 * Creates a context module that binds to whichever facade composes it.
 *
 * @remarks
 * The facade `use` composes it on picks the options: {@link useQueryStates}
 * types `preserve`/`only` against its schema, {@link useQueryState} types them
 * for the single param. Passing only `active` yields the base form, valid on
 * either facade. Call `withContext(schema, options)` to build a grouped module
 * with schema-checked keys outside a `use`, or `withContext(param, options)` /
 * `withContext(path, options)` to build a single-param module.
 *
 * The module taps a `read`/`write` pipeline transform that drops params invalid
 * in the active context, so such a param never enters `values` or derived module
 * state, and a write to one is dropped. An invalid param already in the URL (a
 * pasted stale link) stays hidden from reads and is cleared on the next context
 * switch via `switchTo` or `buildContextQuery`. On a context change the module
 * emits the `'context:change'` hook (so modules such as {@link withRuntimeDefaults}
 * clear per-context state). It never navigates on its own.
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
 * switchTo('orders') // one navigation: preserved params kept, the rest reset
 * ```
 */
export const withContext = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:context',
  queryStates: <TSchema extends QueryStateSchema, TContext extends string>(
    core: QueryCore<TSchema>,
    options: QueryStatesContextOptions<TSchema, TContext>,
  ): ContextStatesApi<TContext> =>
    createContextControls(core, resolveQueryStatesContextOptions(options)),
  queryState: <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string, TContext extends string>(
    core: QueryCore<TSchema>,
    key: TKey,
    options: QueryStateContextOptions<TContext>,
  ): ContextStateApi<TContext> =>
    createContextControls(core, resolveQueryStateContextOptions<TSchema, TContext>(options), key),
})

function createContextControls<TSchema extends QueryStateSchema, TContext extends string>(
  core: QueryCore<TSchema>,
  options: ResolvedContextOptions<TSchema, TContext>,
  key?: keyof TSchema & string,
): ContextControls<TContext> {
  const active = computed(() => toValue(options.active))

  const untap = core.pipeline.tap(['read', 'write'], pickBy(paramKey => options.isValidIn(paramKey, active.value)))
  onScopeDispose(untap)

  function build(currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw {
    const parsed = parseQueryStates(core.schema, currentQuery) as Record<string, unknown>
    const kept: Record<string, unknown> = {}
    const keys = key === undefined ? Object.keys(core.schema) as Array<keyof TSchema & string> : [key]

    for (const paramKey of keys) {
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

  function buildContextQuery(currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw {
    return core.pipeline.run('navigate', build(currentQuery, nextContext))
  }

  function switchTo(target: TContext, navigateOptions?: NavigateOptions): void {
    if (!options.navigate) {
      throw new Error('[vuqs] withContext: provide a `navigate` option to use switchTo()')
    }

    options.navigate(target, buildContextQuery(core.query.current(), target), navigateOptions)
  }

  watch(active, (nextContext) => {
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
