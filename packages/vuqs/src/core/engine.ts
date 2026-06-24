import type { ComputedRef } from 'vue'
import type { QueryPipelineBus, QueryValues } from './pipeline'
import type { Overlay, UpdateQueueAdapterContext } from './queues/throttle'
import type { QueryStateSchema, QueryStateValues } from './schema'
import type { NavigateOptions, ParsedQuery } from './types'
import { computed, toValue, watch } from 'vue'
import { structuralEq } from './equality'
import { deletePath, getPath, pruneEmptyAncestors, setPath } from './path'
import { createQueryPipeline } from './pipeline'
import { cloneQuery } from './query-object'
import { globalThrottleQueue } from './queues/throttle'
import { dropDefaults, getManagedKeys, parseQueryStates, serializeQueryStates } from './schema'

/**
 * Options for {@link createQueryStateEngine}.
 *
 * @remarks
 * Extends {@link NavigateOptions}, so `history` and `scroll` set the navigation
 * defaults applied to every write unless a per-call write overrides them. `schema`
 * and `adapter` are required; `throttleMs` and `clearOnDefault` are behavior knobs
 * with their own defaults.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateEngineOptions<TSchema extends QueryStateSchema> extends NavigateOptions {
  /** The tracked params, used for per-param equality, defaults, and keys. */
  schema: TSchema
  /** The query source and navigate function, resolved from the provided adapter. */
  adapter: UpdateQueueAdapterContext
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
}

/**
 * The reactive core behind URL-bound state, used by {@link useQueryStates}: a
 * resolved value map plus a scheduled, optimistic `setValue`.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateEngine<TSchema extends QueryStateSchema> {
  /** Current values: parsed from the URL with the optimistic overlay, codec defaults, and the read pipeline applied. */
  values: ComputedRef<QueryStateValues<TSchema>>
  /** Explicit selections plus the optimistic overlay, with the read pipeline applied and without codec defaults. */
  rawValues: ComputedRef<QueryStateValues<TSchema>>
  /** Optimistically sets a param and schedules a coalesced navigation. */
  setValue: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
  /** The transform pipeline applied to reads and writes. */
  pipeline: QueryPipelineBus
  /** The resolved `clearOnDefault` rule, so modules building queries match the engine's write behavior. */
  clearOnDefault: boolean
}

/**
 * Creates the reactive engine behind URL-bound state.
 *
 * @remarks
 * Committed model: the URL is the source of truth. A write serializes to raw
 * deltas and lands in a single optimistic overlay shared by every engine, so
 * concurrent writes from different engines coalesce into one navigation instead
 * of racing.
 * Once the URL reflects a delta that param's overlay entry is reconciled away;
 * entries the URL has not caught up to are kept, so an unrelated navigation cannot
 * discard an in-flight write.
 *
 * Creates a `watch` owned by the active Vue effect scope. Call it inside a
 * component `setup` (or an `effectScope().run()`) so the watch is disposed with
 * its owner; calling it with no active scope leaks the watcher.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 * @param options - Schema, resolved adapter, and the coalescing and default rules.
 * @returns The engine: resolved `values` and `rawValues`, a `setValue` writer,
 * the `pipeline`, and the resolved `clearOnDefault`.
 */
export function createQueryStateEngine<TSchema extends QueryStateSchema>(
  options: QueryStateEngineOptions<TSchema>,
): QueryStateEngine<TSchema> {
  const { schema, adapter, throttleMs = 0, clearOnDefault = true } = options
  const keys = Object.keys(schema) as Array<keyof TSchema & string>
  const managedPaths = getManagedKeys(schema)

  const pipeline = createQueryPipeline()
  const overlay = globalThrottleQueue.overlay

  // The live URL with this engine's pending overlay deltas applied. The optimistic
  // overlay is one ref shared by every engine, so reading it here re-derives this
  // engine whenever any engine writes.
  const optimisticQuery = computed<ParsedQuery>(() => {
    const next = cloneQuery(toValue(adapter.query))
    const current = overlay.value

    for (const path of managedPaths) {
      if (!(path in current)) {
        continue
      }

      const delta = current[path]

      if (delta === null) {
        deletePath(next, path)
        pruneEmptyAncestors(next, path)
      }
      else {
        setPath(next, path, delta)
      }
    }

    return next
  })

  const values = computed<QueryStateValues<TSchema>>(() => {
    const parsed = parseQueryStates(schema, optimisticQuery.value) as Record<string, unknown>

    for (const key of keys) {
      if (parsed[key] === undefined && schema[key].defaultValue !== undefined) {
        parsed[key] = schema[key].defaultValue
      }
    }

    return pipeline.run('read', parsed) as QueryStateValues<TSchema>
  })

  // The explicit selection: params actually present in the URL (or written
  // optimistically), WITHOUT codec defaults. A defaulted param that fell back to
  // its default parses as present, so it is dropped unless one of its paths exists.
  const rawValues = computed<QueryStateValues<TSchema>>(() => {
    const query = optimisticQuery.value
    const parsed = parseQueryStates(schema, query) as Record<string, unknown>

    for (const key of keys) {
      if (!schema[key].paths.some(path => getPath(query, path) !== undefined)) {
        delete parsed[key]
      }
    }

    return pipeline.run('read', parsed) as QueryStateValues<TSchema>
  })

  // Committed model: drop a pending delta once the URL reflects it. Idempotent and
  // raw-compared, so any engine can reconcile any of its managed paths.
  watch(() => toValue(adapter.query), (url) => {
    const current = overlay.value
    const reflected: string[] = []

    for (const path of managedPaths) {
      if (!(path in current)) {
        continue
      }

      const delta = current[path]
      const urlValue = getPath(url, path)
      const settled = delta === null ? urlValue === undefined : structuralEq(urlValue, delta)

      if (settled) {
        reflected.push(path)
      }
    }

    globalThrottleQueue.settle(reflected)
  }, { immediate: true })

  function serializeParam(key: keyof TSchema & string, value: unknown): Overlay {
    const definition = schema[key]
    const single: QueryStateSchema = { [key]: definition }

    let map: QueryStateValues<QueryStateSchema> = value === undefined ? {} : { [key]: value }

    if (clearOnDefault) {
      map = dropDefaults(single, map)
    }

    map = pipeline.run('write', map as QueryValues) as QueryStateValues<QueryStateSchema>

    const raw = serializeQueryStates(single, map)
    const deltas: Overlay = {}

    for (const path of definition.paths) {
      const written = getPath(raw, path)
      deltas[path] = written === undefined ? null : written
    }

    return deltas
  }

  function setValue(key: keyof TSchema & string, value: unknown, perCall?: NavigateOptions): void {
    globalThrottleQueue.push(
      serializeParam(key, value),
      {
        history: perCall?.history ?? options.history,
        scroll: perCall?.scroll ?? options.scroll,
      },
      adapter,
      throttleMs,
    )
  }

  return { values, rawValues, setValue, pipeline, clearOnDefault }
}
