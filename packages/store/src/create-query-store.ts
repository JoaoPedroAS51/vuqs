import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type {
  NavigateOptions,
  ParsedQuery,
  ParsedQueryRaw,
  QueryStateNavigate,
  QueryStateSchema,
  QueryStateValues,
  QueryStateWriteValues,
} from 'vuqs'
import { computed, ref, toValue, watch } from 'vue'
import {
  assertUniquePaths,
  buildQuery as buildQueryCore,
  createQueryStateEngine,
  parseQueryStates,
} from 'vuqs'

/**
 * Context configuration for a query store.
 *
 * @remarks
 * `active` is an external, opaque identifier such as a tab, route, or wizard
 * step. The store never derives it. `only` restricts the contexts a field exists
 * in, and `preserve` marks fields kept across a context change, consumed by
 * {@link QueryStore.buildContextQuery}.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 */
export interface QueryStoreContext<TSchema extends QueryStateSchema, TContext extends string> {
  /** The active context, as a ref, getter, or plain value. */
  active: MaybeRefOrGetter<TContext>
  /** Fields kept across a context change; everything else resets. Used by context navigation. */
  preserve?: ReadonlyArray<keyof TSchema & string>
  /** Per-field validity: the contexts a field exists in. Omit a field to make it valid everywhere. */
  only?: Partial<Record<keyof TSchema & string, readonly TContext[]>>
}

/**
 * Options for {@link createQueryStore}.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 */
export interface CreateQueryStoreOptions<TSchema extends QueryStateSchema, TContext extends string> {
  /**
   * The fields the store manages, keyed by logical name.
   *
   * @remarks
   * Use plain codecs: the store supplies defaults via `setDefaults`, so a codec
   * `.withDefault()` would shadow the API defaults in `effective`.
   */
  schema: TSchema
  /** The current parsed query, as a ref, getter, or plain value. */
  query: MaybeRefOrGetter<ParsedQuery>
  /** Applies the next query to the URL. */
  navigate: QueryStateNavigate
  /** Default history mode for writes. */
  history?: 'replace' | 'push'
  /** Default scroll behavior for writes. */
  scroll?: boolean
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
  /** Context configuration. Omit for a flat store with no context-based reset/validity. */
  context?: QueryStoreContext<TSchema, TContext>
}

/**
 * A query store: the three states (`selected`, `defaults`, `effective`) plus
 * writers. Only `selected` is serialized to the URL; `defaults` feed the UI but
 * never reach the URL; `effective` is `selected` layered over `defaults`.
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 */
export interface QueryStore<TSchema extends QueryStateSchema, TContext extends string = string> {
  /** Explicit user selections, mirrored from the URL and filtered by the active context. */
  selected: ComputedRef<QueryStateValues<TSchema>>
  /** Defaults supplied by an API/loader. Never serialized to the URL. */
  defaults: ComputedRef<QueryStateValues<TSchema>>
  /** `selected` layered over `defaults`, filtered by the active context. */
  effective: ComputedRef<QueryStateValues<TSchema>>
  /** The active context, or `undefined` when the store has no context. */
  activeContext: ComputedRef<TContext | undefined>
  /** Sets one field. Passing `undefined` clears it, reverting to its default; the batch {@link QueryStore.setValues} instead uses `null` to clear. */
  setValue: <Key extends keyof TSchema & string>(
    key: Key,
    value: QueryStateValues<TSchema>[Key],
    options?: NavigateOptions,
  ) => void
  /** Sets several fields at once, coalesced into one navigation. Omit a field (or pass `undefined`) to leave it untouched, `null` to clear it, or a value to set it. */
  setValues: (values: QueryStateWriteValues<TSchema>, options?: NavigateOptions) => void
  /** Clears every selected value (reverting each to its default). */
  clear: (options?: NavigateOptions) => void
  /** Replaces the defaults with a snapshot, for example from an API response. */
  setDefaults: (values: QueryStateValues<TSchema>) => void
  /** Removes all defaults. */
  clearDefaults: () => void
  /** Builds the query for the current selection without navigating, for example to render a link. */
  buildQuery: (currentQuery: ParsedQuery) => ParsedQueryRaw
  /** Builds the query for switching to `nextContext` in one navigation: keeps preserved fields valid there, resets the rest, and preserves unmanaged params. */
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
}

/**
 * Creates a query store: URL-synced `selected`, API-supplied `defaults`, and a
 * derived `effective`, with optional context-based field validity.
 *
 * @remarks
 * Built on {@link createQueryStateEngine}, with context-aware `parse`/`build` so
 * a field invalid in the active context never enters `selected`, the URL, or
 * `effective`. Call within a Vue effect scope (see the engine's note).
 *
 * @typeParam TSchema - The store's schema.
 * @typeParam TContext - The union of context identifiers.
 * @param options - Schema, query source, navigate adapter, and optional context.
 * @returns The store's states and writers.
 * @throws {Error} When two fields declare the same query path.
 */
export function createQueryStore<TSchema extends QueryStateSchema, TContext extends string = string>(
  options: CreateQueryStoreOptions<TSchema, TContext>,
): QueryStore<TSchema, TContext> {
  const { schema, context } = options

  assertUniquePaths(schema)

  const activeContext = computed(() => (context ? toValue(context.active) : undefined))

  function isValidInContext(key: string, ctx: TContext): boolean {
    const contexts = context?.only?.[key as keyof TSchema & string]

    return contexts === undefined || contexts.includes(ctx)
  }

  function isValid(key: string): boolean {
    const active = activeContext.value

    if (active === undefined || !context?.only) {
      return true
    }

    return isValidInContext(key, active)
  }

  function filterValid(values: QueryStateValues<TSchema>): QueryStateValues<TSchema> {
    if (activeContext.value === undefined || !context?.only) {
      return values
    }

    const result: Record<string, unknown> = {}

    for (const key of Object.keys(values)) {
      if (isValid(key)) {
        result[key] = (values as Record<string, unknown>)[key]
      }
    }

    return result as QueryStateValues<TSchema>
  }

  const engine = createQueryStateEngine<TSchema>({
    schema,
    query: options.query,
    navigate: options.navigate,
    parse: query => filterValid(parseQueryStates(schema, query)),
    build: (currentQuery, values) => buildQueryCore(schema, currentQuery, filterValid(values)),
    history: options.history,
    scroll: options.scroll,
    throttleMs: options.throttleMs,
    clearOnDefault: options.clearOnDefault,
  })

  const defaultsRef = ref<QueryStateValues<TSchema>>({})

  const selected = engine.values
  const defaults = computed(() => defaultsRef.value)
  const effective = computed<QueryStateValues<TSchema>>(() =>
    filterValid({ ...defaultsRef.value, ...selected.value } as QueryStateValues<TSchema>),
  )

  function setValue<Key extends keyof TSchema & string>(
    key: Key,
    value: QueryStateValues<TSchema>[Key],
    perCall?: NavigateOptions,
  ): void {
    if (isValid(key)) {
      engine.setValue(key, value, perCall)
    }
  }

  function setValues(values: QueryStateWriteValues<TSchema>, perCall?: NavigateOptions): void {
    for (const key of Object.keys(values) as Array<keyof TSchema & string>) {
      const value = (values as Record<string, unknown>)[key]

      if (value === undefined) {
        continue
      }

      setValue(key, value === null ? undefined : value as QueryStateValues<TSchema>[typeof key], perCall)
    }
  }

  function clear(perCall?: NavigateOptions): void {
    for (const key of Object.keys(schema) as Array<keyof TSchema & string>) {
      if (isValid(key)) {
        engine.setValue(key, undefined, perCall)
      }
    }
  }

  function setDefaults(values: QueryStateValues<TSchema>): void {
    defaultsRef.value = { ...values }
  }

  function clearDefaults(): void {
    defaultsRef.value = {}
  }

  function buildQuery(currentQuery: ParsedQuery): ParsedQueryRaw {
    return buildQueryCore(schema, currentQuery, filterValid(selected.value))
  }

  function buildContextQuery(currentQuery: ParsedQuery, nextContext: TContext): ParsedQueryRaw {
    const parsed = parseQueryStates(schema, currentQuery) as Record<string, unknown>
    const kept: Record<string, unknown> = {}

    for (const key of context?.preserve ?? []) {
      if (parsed[key] !== undefined && isValidInContext(key, nextContext)) {
        kept[key] = parsed[key]
      }
    }

    return buildQueryCore(schema, currentQuery, kept as QueryStateValues<TSchema>)
  }

  // Defaults are per-context (re-supplied by the next context's API), so drop
  // them when the context changes to avoid showing stale defaults.
  if (context) {
    watch(activeContext, () => {
      defaultsRef.value = {}
    }, { flush: 'sync' })
  }

  return {
    selected,
    defaults,
    effective,
    activeContext,
    setValue,
    setValues,
    clear,
    setDefaults,
    clearDefaults,
    buildQuery,
    buildContextQuery,
  }
}
