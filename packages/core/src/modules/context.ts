import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { DefinedQueryStateModule, QueryStatesModule } from '../core/module'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema, QueryStateValues } from '../core/schema'
import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../core/types'
import type { NoInferType } from '../shared'
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
 * `preserve` and `only` are keyed by schema param names. They are checked either
 * from the schema passed to {@link withContext} or from the schema supplied by
 * {@link QueryComposable.use}.
 *
 * @typeParam TSchema - The schema whose param names key `preserve` and `only`.
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStatesContextOptions<TSchema extends QueryStateSchema, TContext extends string>
  = ContextBaseOptions<TContext> & (
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
 * `preserve` and `only` describe the single param bound by {@link useQueryState}.
 * Use `withContext({ active })` when no single-specific option is needed.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export type QueryStateContextOptions<TContext extends string> = ContextBaseOptions<TContext> & (
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

type BaseContextModule<TContext extends string> = DefinedQueryStateModule<ContextStateApi<TContext>> & {
  <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): ContextStatesApi<TContext>
}

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
 * Creates a context module with schema-checked param keys.
 *
 * @remarks
 * The `schema` argument binds `preserve` and `only` to the schema's param names.
 * TypeScript rejects keys that are not present in the schema.
 *
 * The module taps a `read`/`write` pipeline transform that drops params invalid
 * in the active context, so such a param never enters `values` or derived module
 * state, and a write to one is dropped. An invalid param already in the URL (a
 * pasted stale link) stays hidden from reads and is cleared on the next context
 * switch via `switchTo` or `buildContextQuery`.
 *
 * On a context change the module emits the `'context:change'` hook (so modules
 * such as {@link withRuntimeDefaults} clear per-context state) and the read/write
 * filter follows the active context. It never navigates on its own: drive the
 * switch with `switchTo` (one navigation, via the `navigate` option) or build the
 * query yourself with `buildContextQuery`.
 *
 * @typeParam TSchema - The schema whose param names key `preserve` and `only`.
 * @typeParam TContext - The union of context identifiers.
 * @param schema - The schema used to type-check `preserve` and `only`.
 * @param options - The active context, preserved params, per-param validity, and the `navigate` mapping.
 * @returns A query module that contributes {@link ContextStatesApi}.
 *
 * @example
 * ```ts
 * const { switchTo } = useQueryStates(schema)
 *   .use(withContext(schema, {
 *     active: () => route.name as 'products' | 'orders',
 *     preserve: ['q'],
 *     only: { category: ['products'] },
 *     navigate: (target, query) => navigateTo({ name: target, query }),
 *   }))
 *
 * switchTo('orders') // one navigation: preserved params kept, the rest reset
 * ```
 */
export function withContext<TSchema extends QueryStateSchema, TContext extends string>(
  schema: TSchema,
  options: QueryStatesContextOptions<TSchema, TContext>,
): QueryStatesModule<TSchema, ContextStatesApi<TContext>>
export function withContext<TSchema extends QueryStateSchema, TContext extends string>(
  schema: TSchema,
  options: ContextBaseOptions<TContext>,
): QueryStatesModule<TSchema, ContextStatesApi<TContext>>
/**
 * Creates a single-param context module.
 *
 * @remarks
 * `preserve` and `only` describe the single param bound by
 * `useQueryState(...).use(...)`. The internal single schema key is not exposed in
 * the public options.
 *
 * @typeParam TContext - The union of context identifiers.
 * @param options - The active context, single-param preservation, validity, and navigation mapping.
 * @returns A single-param query module that contributes {@link ContextStateApi}.
 */
export function withContext<TContext extends string>(
  options: QueryStateContextOptions<TContext>,
): DefinedQueryStateModule<ContextStateApi<TContext>>
/**
 * Creates a context module whose param keys are checked by `use`.
 *
 * @remarks
 * This overload returns a {@link QueryStatesModule}. When it is passed to
 * `useQueryStates(schema).use(...)`, TypeScript checks `preserve` and `only`
 * against that schema's param names.
 *
 * Invalid params are filtered out, and a context change emits the
 * `'context:change'` hook. Navigate with `switchTo` or `buildContextQuery`.
 *
 * @typeParam TSchema - The schema inferred from `useQueryStates(...).use(...)`.
 * @typeParam TContext - The union of context identifiers.
 * @param options - The active context, preserved params, and per-param validity.
 * @returns A query module that contributes {@link ContextStatesApi}.
 *
 * @example
 * ```ts
 * const { activeContext } = useQueryStates(schema)
 *   .use(withContext({ active: () => route.name, preserve: ['q'] }))
 *
 * activeContext.value // mirrors the active context
 * ```
 */
export function withContext<TSchema extends QueryStateSchema, TContext extends string>(
  options: QueryStatesContextOptions<NoInferType<TSchema>, TContext>,
): QueryStatesModule<TSchema, ContextStatesApi<TContext>>
/**
 * Creates a context module with no param-specific rules.
 *
 * @remarks
 * The returned module supports both `useQueryStates` and `useQueryState`. Add a
 * grouped `preserve` array or `only` map for grouped-specific rules; add a
 * single `preserve` boolean or `only` array for single-param rules.
 *
 * @typeParam TContext - The union of context identifiers.
 * @param options - The active context and optional navigation mapping.
 * @returns A query module that contributes {@link ContextStatesApi} and {@link ContextStateApi}.
 */
export function withContext<TContext extends string>(
  options: ContextBaseOptions<TContext>,
): BaseContextModule<TContext>
export function withContext<TContext extends string>(
  schemaOrOptions: QueryStateSchema | QueryStatesContextOptions<QueryStateSchema, TContext> | QueryStateContextOptions<TContext> | ContextBaseOptions<TContext>,
  maybeOptions?: QueryStatesContextOptions<QueryStateSchema, TContext> | ContextBaseOptions<TContext>,
): QueryStatesModule<QueryStateSchema, ContextStatesApi<TContext>> | DefinedQueryStateModule<ContextStateApi<TContext>> | BaseContextModule<TContext> {
  const options = (maybeOptions ?? schemaOrOptions) as QueryStatesContextOptions<QueryStateSchema, TContext> | QueryStateContextOptions<TContext> | ContextBaseOptions<TContext>

  if (isSingleContextOptions(options)) {
    return defineQueryModule({
      queryState: (core, key) => createContextStateApi(core, resolveQueryStateContextOptions(options), key),
    })
  }

  if (isBaseContextOptions(options)) {
    const queryStates = <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): ContextStatesApi<TContext> =>
      createContextStatesApi(core, resolveBaseContextOptions(options))
    const queryState = <TSchema extends QueryStateSchema, TKey extends keyof TSchema & string>(
      core: QueryCore<TSchema>,
      key: TKey,
    ): ContextStateApi<TContext> => createContextStateApi(core, resolveBaseContextOptions(options), key)

    return defineQueryModule({ queryStates, queryState }) as BaseContextModule<TContext>
  }

  const groupedOptions = options as QueryStatesContextOptions<QueryStateSchema, TContext>

  return <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) =>
    createContextStatesApi<TSchema, TContext>(
      core,
      resolveQueryStatesContextOptions<TSchema, TContext>(groupedOptions),
    )
}

function createContextStatesApi<TSchema extends QueryStateSchema, TContext extends string>(
  core: QueryCore<TSchema>,
  options: ResolvedContextOptions<TSchema, TContext>,
): ContextStatesApi<TContext> {
  return createContextControls(core, options)
}

function createContextStateApi<TSchema extends QueryStateSchema, TContext extends string>(
  core: QueryCore<TSchema>,
  options: ResolvedContextOptions<TSchema, TContext>,
  key: keyof TSchema & string,
): ContextStateApi<TContext> {
  return createContextControls(core, options, key)
}

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
  options: QueryStatesContextOptions<QueryStateSchema, TContext>,
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

function resolveQueryStateContextOptions<TContext extends string>(
  options: QueryStateContextOptions<TContext>,
): ResolvedContextOptions<QueryStateSchema, TContext> {
  return {
    active: options.active,
    navigate: options.navigate,
    isPreserved: () => options.preserve === true,
    isValidIn: (_key, context) => options.only === undefined || options.only.includes(context),
  }
}

function resolveBaseContextOptions<TContext extends string>(
  options: ContextBaseOptions<TContext>,
): ResolvedContextOptions<QueryStateSchema, TContext> {
  return {
    active: options.active,
    navigate: options.navigate,
    isPreserved: () => false,
    isValidIn: () => true,
  }
}

function isSingleContextOptions<TContext extends string>(
  options: QueryStatesContextOptions<QueryStateSchema, TContext> | QueryStateContextOptions<TContext> | ContextBaseOptions<TContext>,
): options is QueryStateContextOptions<TContext> {
  return typeof (options as { preserve?: unknown }).preserve === 'boolean'
    || Array.isArray((options as { only?: unknown }).only)
}

function isBaseContextOptions<TContext extends string>(
  options: QueryStatesContextOptions<QueryStateSchema, TContext> | ContextBaseOptions<TContext>,
): options is ContextBaseOptions<TContext> {
  return !('preserve' in options) && !('only' in options)
}
