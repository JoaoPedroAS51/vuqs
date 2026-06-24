import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryStateDefinition } from './define-query-state'
import type { QueryPipelineBus } from './pipeline'
import type { QueryStateSchema, QueryStateValues } from './schema'
import type { NavigateOptions, ParsedQuery, ParsedQueryRaw, QueryStateNavigate } from './types'
import { computed, ref, toValue, watch } from 'vue'
import { getPath } from './path'
import { createQueryPipeline } from './pipeline'
import { dropDefaults } from './schema'

/**
 * Options for {@link createQueryStateEngine}.
 *
 * @remarks
 * `parse` and `build` are injected so a caller can make reads and writes
 * context-aware, for example filtering fields by an active context, while the
 * engine owns the reactive machinery: the optimistic overlay, reconciliation,
 * write coalescing, and navigation.
 *
 * @typeParam TSchema - The schema whose fields the engine tracks.
 */
export interface QueryStateEngineOptions<TSchema extends QueryStateSchema> extends NavigateOptions {
  /** The tracked fields, used for per-field equality, defaults, and keys. */
  schema: TSchema
  /** The current parsed query, as a ref, getter, or plain value. */
  query: MaybeRefOrGetter<ParsedQuery>
  /** Applies the next query to the URL. */
  navigate: QueryStateNavigate
  /** Reads field values from a query (the caller may make this context-aware). */
  parse: (query: ParsedQuery) => QueryStateValues<TSchema>
  /** Builds the next query from the values to commit (the caller may make this context-aware). */
  build: (currentQuery: ParsedQuery, values: QueryStateValues<TSchema>) => ParsedQueryRaw
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
}

/**
 * The reactive core behind URL-bound state, used by {@link useQueryStates}: a
 * resolved value map plus a scheduled, optimistic `setValue`.
 *
 * @typeParam TSchema - The schema whose fields the engine tracks.
 */
export interface QueryStateEngine<TSchema extends QueryStateSchema> {
  /** Current values: parsed from the URL with the optimistic overlay, codec defaults, and the read pipeline applied. */
  values: ComputedRef<QueryStateValues<TSchema>>
  /** Explicit selections plus the optimistic overlay, with the read pipeline applied and without codec defaults. */
  rawValues: ComputedRef<QueryStateValues<TSchema>>
  /** Optimistically sets a field and schedules a coalesced navigation. */
  setValue: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
  /** The transform pipeline applied to reads, writes, and the navigation boundary. */
  pipeline: QueryPipelineBus
  /** The resolved `clearOnDefault` rule, so modules building queries match the engine's write behavior. */
  clearOnDefault: boolean
}

/**
 * Creates the reactive engine behind URL-bound state.
 *
 * @remarks
 * Committed model: the URL is the source of truth. Writes apply to an optimistic
 * overlay and flush to `navigate` as one coalesced navigation (per microtask, or
 * per `throttleMs`). Once the URL reflects a write, that field's overlay entry is
 * reconciled away; entries the URL has not caught up to are kept so an unrelated
 * navigation cannot discard an in-flight write.
 *
 * Creates a `watch` owned by the active Vue effect scope. Call it inside a
 * component `setup` (or an `effectScope().run()`) so the watch is disposed with
 * its owner; calling it with no active scope leaks the watcher.
 *
 * @typeParam TSchema - The schema whose fields the engine tracks.
 * @param options - Schema, query source, navigate adapter, and the `parse`/`build` hooks.
 * @returns The engine: resolved `values` and `rawValues`, a `setValue` writer,
 * the `pipeline`, and the resolved `clearOnDefault`.
 */
export function createQueryStateEngine<TSchema extends QueryStateSchema>(
  options: QueryStateEngineOptions<TSchema>,
): QueryStateEngine<TSchema> {
  const { schema, navigate, parse, build, throttleMs = 0, clearOnDefault = true } = options
  const keys = Object.keys(schema) as Array<keyof TSchema & string>

  const pipeline = createQueryPipeline()

  const urlValues = computed(() => parse(toValue(options.query)))
  const pending = ref<Record<string, unknown>>({})

  // The explicit selection: parsed values for fields actually present in the URL
  // (or written optimistically), WITHOUT codec defaults — a field that fell back
  // to its codec default is treated as absent, not selected.
  const rawValues = computed<QueryStateValues<TSchema>>(() => {
    const query = toValue(options.query)
    const merged = { ...urlValues.value, ...pending.value } as Record<string, unknown>

    for (const key of keys) {
      if (Object.hasOwn(pending.value, key)) {
        continue
      }

      if (!schema[key].paths.some(path => getPath(query, path) !== undefined)) {
        delete merged[key]
      }
    }

    return pipeline.run('read', merged) as QueryStateValues<TSchema>
  })

  const values = computed<QueryStateValues<TSchema>>(() => {
    const merged = { ...urlValues.value, ...pending.value } as Record<string, unknown>

    for (const key of keys) {
      if (merged[key] === undefined && schema[key].defaultValue !== undefined) {
        merged[key] = schema[key].defaultValue
      }
    }

    return pipeline.run('read', merged) as QueryStateValues<TSchema>
  })

  // Committed model: drop a pending write once the URL reflects it. Entries the
  // URL has not caught up to are kept, so an unrelated navigation cannot discard
  // an in-flight write.
  watch(urlValues, (parsed) => {
    if (Object.keys(pending.value).length === 0) {
      return
    }

    const remaining: Record<string, unknown> = {}

    for (const [key, pendingValue] of Object.entries(pending.value)) {
      if (!isReconciled(schema[key], pendingValue, (parsed as Record<string, unknown>)[key])) {
        remaining[key] = pendingValue
      }
    }

    if (Object.keys(remaining).length !== Object.keys(pending.value).length) {
      pending.value = remaining
    }
  })

  let scheduled = false
  let scheduledOptions: NavigateOptions = {}

  function schedule(perCall: NavigateOptions | undefined): void {
    if (perCall) {
      scheduledOptions = { ...scheduledOptions, ...perCall }
    }

    if (scheduled) {
      return
    }

    scheduled = true

    const flush = (): void => {
      scheduled = false
      const navigateOptions = scheduledOptions
      scheduledOptions = {}
      commit(navigateOptions)
    }

    if (throttleMs > 0) {
      setTimeout(flush, throttleMs)
    }
    else {
      queueMicrotask(flush)
    }
  }

  function commit(perCall: NavigateOptions): void {
    const currentQuery = toValue(options.query)
    const merged = { ...parse(currentQuery), ...pending.value } as QueryStateValues<TSchema>
    const target = pipeline.run('write', clearOnDefault ? dropDefaults(schema, merged) : merged) as QueryStateValues<TSchema>
    const query = pipeline.run('navigate', build(currentQuery, target))

    void navigate(query, {
      history: perCall.history ?? options.history,
      scroll: perCall.scroll ?? options.scroll,
    })
  }

  function setValue(key: keyof TSchema & string, value: unknown, perCall?: NavigateOptions): void {
    pending.value = { ...pending.value, [key]: value }
    schedule(perCall)
  }

  return { values, rawValues, setValue, pipeline, clearOnDefault }
}

function isReconciled(
  definition: QueryStateDefinition<any>,
  pendingValue: unknown,
  urlValue: unknown,
): boolean {
  if (pendingValue === undefined) {
    return urlValue === undefined
      || (definition.defaultValue !== undefined && definition.eq(urlValue, definition.defaultValue))
  }

  return urlValue !== undefined && definition.eq(pendingValue, urlValue)
}
