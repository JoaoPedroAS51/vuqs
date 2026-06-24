import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryStateSchema, QueryStateValues } from '../core/schema'
import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../core/types'
import type { QueryCore, QueryModule } from '../core/use-query-states'
import type { NoInferType } from '../shared'
import { computed, onScopeDispose, toValue, watch } from 'vue'
import { buildQuery, dropDefaults, parseQueryStates } from '../core/schema'
import { pickBy } from '../shared'

declare module 'vuqs' {
  interface QueryHooks {
    /** Published by {@link withContext} when the active context changes. */
    'context:change': (context: string) => void
  }
}

/**
 * Options for {@link withContext}.
 *
 * @remarks
 * `preserve` and `only` are keyed by schema param names. They are checked either
 * from the schema passed to {@link withContext} or from the schema supplied by
 * {@link QueryComposable.use}.
 *
 * @typeParam TSchema - The schema whose param names key `preserve` and `only`.
 * @typeParam TContext - The union of context identifiers.
 */
export interface ContextOptions<TSchema extends QueryStateSchema, TContext extends string> {
  /** The active context as a ref, getter, or plain value. The module never derives it. */
  active: MaybeRefOrGetter<TContext>
  /** Params kept across a context change; everything else resets. */
  preserve?: ReadonlyArray<keyof TSchema & string>
  /** Per-param validity: the contexts a param exists in. Omit a param to make it valid everywhere. */
  only?: Partial<Record<keyof TSchema & string, readonly TContext[]>>
  /**
   * How to navigate to a context. The module reconciles the query and passes it
   * here with the target context, so the consumer issues one navigation that
   * carries both the path and the query. Required to call `switchTo`.
   */
  navigate?: (target: TContext, query: ParsedQueryRaw, options?: NavigateOptions) => void
}

/**
 * API contributed by {@link withContext}.
 *
 * @typeParam TContext - The union of context identifiers.
 */
export interface ContextApi<TContext extends string> {
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
 * such as {@link withEffective} clear per-context state) and the read/write
 * filter follows the active context. It never navigates on its own: drive the
 * switch with `switchTo` (one navigation, via the `navigate` option) or build the
 * query yourself with `buildContextQuery`.
 *
 * @typeParam TSchema - The schema whose param names key `preserve` and `only`.
 * @typeParam TContext - The union of context identifiers.
 * @param schema - The schema used to type-check `preserve` and `only`.
 * @param options - The active context, preserved params, per-param validity, and the `navigate` mapping.
 * @returns A query module that contributes {@link ContextApi}.
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
  options: ContextOptions<TSchema, TContext>,
): QueryModule<TSchema, ContextApi<TContext>>
/**
 * Creates a context module whose param keys are checked by `use`.
 *
 * @remarks
 * This overload returns a {@link QueryModule}. When it is passed to
 * `useQueryStates(schema).use(...)`, TypeScript checks `preserve` and `only`
 * against that schema's param names.
 *
 * Invalid params are filtered out, and a context change emits the
 * `'context:change'` hook. Navigate with `switchTo` or `buildContextQuery`.
 *
 * @typeParam TSchema - The schema inferred from `useQueryStates(...).use(...)`.
 * @typeParam TContext - The union of context identifiers.
 * @param options - The active context, preserved params, and per-param validity.
 * @returns A query module that contributes {@link ContextApi}.
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
  options: ContextOptions<NoInferType<TSchema>, TContext>,
): QueryModule<TSchema, ContextApi<TContext>>
export function withContext<TContext extends string>(
  schemaOrOptions: QueryStateSchema | ContextOptions<QueryStateSchema, TContext>,
  maybeOptions?: ContextOptions<QueryStateSchema, TContext>,
): <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => ContextApi<TContext> {
  const options = (maybeOptions ?? schemaOrOptions) as ContextOptions<QueryStateSchema, TContext>

  return <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>): ContextApi<TContext> => {
    const active = computed(() => toValue(options.active))

    function isValidIn(key: string, context: TContext): boolean {
      const contexts = options.only?.[key]

      return contexts === undefined || contexts.includes(context)
    }

    const untap = core.pipeline.tap(['read', 'write'], pickBy(key => isValidIn(key, active.value)))
    onScopeDispose(untap)

    function build(currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw {
      const parsed = parseQueryStates(core.schema, currentQuery) as Record<string, unknown>
      const kept: Record<string, unknown> = {}

      for (const key of options.preserve ?? []) {
        if (parsed[key] !== undefined && isValidIn(key, nextContext)) {
          kept[key] = parsed[key]
        }
      }

      const values = kept as QueryStateValues<TSchema>

      return buildQuery(core.schema, currentQuery, core.clearOnDefault ? dropDefaults(core.schema, values) : values)
    }

    function buildContextQuery(currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw {
      return core.pipeline.run('navigate', build(currentQuery, nextContext))
    }

    function switchTo(target: TContext, navigateOptions?: NavigateOptions): void {
      if (!options.navigate) {
        throw new Error('[vuqs] withContext: provide a `navigate` option to use switchTo()')
      }

      options.navigate(target, buildContextQuery(core.currentQuery(), target), navigateOptions)
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
}
