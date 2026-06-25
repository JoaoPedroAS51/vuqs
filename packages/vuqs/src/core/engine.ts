import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryPipelineBus, QueryValues } from './pipeline'
import type { Overlay, UpdateQueueAdapterContext } from './queues/throttle'
import type { QueryStateSchema, QueryStateValues } from './schema'
import type { NavigateOptions, ParsedQuery } from './types'
import { computed, shallowRef, toValue, watch } from 'vue'
import { definedOnly } from '../shared'
import { structuralEq } from './equality'
import { deletePath, getPath, pruneEmptyAncestors, setPath } from './path'
import { createQueryPipeline } from './pipeline'
import { cloneQuery } from './query-object'
import { globalThrottleQueue } from './queues/throttle'
import { getManagedKeys, parseQueryStates, serializeQueryStates } from './schema'

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
  /** Drop a value from the URL when it equals its resolved default. Defaults to `true`. */
  clearOnDefault?: boolean
}

/**
 * The resolved per-instance behavior baseline: the instance options layered over
 * the adapter defaults, fixed at construction. Per-call writes still override
 * `history`/`scroll` through `query.set`.
 */
export interface ResolvedQueryStateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  history?: NavigateOptions['history']
  /** Whether the navigation should scroll. */
  scroll?: NavigateOptions['scroll']
  /** The write-coalescing window in ms (`0` means one microtask). */
  throttleMs: number
  /** Whether a write drops a param that equals its resolved default. */
  clearOnDefault: boolean
}

/**
 * The resolved reactive reads: the explicit selection and the resolved values.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateReads<TSchema extends QueryStateSchema> {
  /** Explicit selection plus overlay, read pipeline applied, defined-only, WITHOUT defaults. */
  selected: ComputedRef<QueryStateValues<TSchema>>
  /** Resolved values: the selection layered over {@link QueryDefaultsBus.resolved}. */
  values: ComputedRef<QueryStateValues<TSchema>>
}

/**
 * The defaults subsystem: read the merged default layers, or contribute one.
 *
 * @remarks
 * The codec defaults form the base layer. A module contributes a reactive layer
 * above it with `register`; later registrations win. The merged layers are the
 * single source the engine uses to resolve `values` and to decide `clearOnDefault`,
 * so reads and writes share one notion of the default. `resolved` exposes that
 * merge with the read pipeline applied, for modules to read.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryDefaultsBus<TSchema extends QueryStateSchema> {
  /** The merged default layers (codec base + registered), read pipeline applied. */
  resolved: ComputedRef<QueryStateValues<TSchema>>
  /** Registers a reactive default layer above the codec base; later registrations win. Returns a disposer. */
  register: (source: MaybeRefOrGetter<QueryStateValues<TSchema>>) => () => void
}

/**
 * The reactive core behind URL-bound state, used by {@link useQueryStates},
 * organized into facets: `state` (reads), `defaults` (subsystem), `query` (I/O),
 * `options` (resolved knobs), and `pipeline`.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateEngine<TSchema extends QueryStateSchema> {
  /** The resolved reactive reads. */
  state: QueryStateReads<TSchema>
  /** The defaults subsystem: read the merge or register a layer. */
  defaults: QueryDefaultsBus<TSchema>
  /** The query I/O boundary. */
  query: {
    /** Reads the current committed query, without the optimistic overlay. */
    current: () => ParsedQuery
    /** Optimistically sets a param and schedules a coalesced navigation. */
    set: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
  }
  /** The resolved per-instance behavior baseline. */
  options: ResolvedQueryStateOptions
  /** The transform pipeline applied to reads and writes. */
  pipeline: QueryPipelineBus
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
 * Defaults resolve through a layered stack: the codec defaults are the base, and
 * modules contribute reactive layers via `defaults.register`. The merged result
 * feeds both value resolution and the `clearOnDefault` decision, so reads and
 * writes share one notion of "the default".
 *
 * Creates a `watch` owned by the active Vue effect scope. Call it inside a
 * component `setup` (or an `effectScope().run()`) so the watch is disposed with
 * its owner; calling it with no active scope leaks the watcher.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 * @param options - Schema, resolved adapter, and the coalescing and default rules.
 * @returns The engine facets: `state`, `defaults`, `query`, `options`, `pipeline`.
 */
export function createQueryStateEngine<TSchema extends QueryStateSchema>(
  options: QueryStateEngineOptions<TSchema>,
): QueryStateEngine<TSchema> {
  const { schema, adapter, history, scroll, throttleMs = 0, clearOnDefault = true } = options
  const keys = Object.keys(schema) as Array<keyof TSchema & string>
  const managedPaths = getManagedKeys(schema)

  const pipeline = createQueryPipeline()
  const overlay = globalThrottleQueue.overlay

  const resolvedOptions: ResolvedQueryStateOptions = { history, scroll, throttleMs, clearOnDefault }

  const codecDefaults: Record<string, unknown> = {}
  for (const key of keys) {
    const value = schema[key].defaultValue
    if (value !== undefined) {
      codecDefaults[key] = value
    }
  }

  // Registrable default layers stacked above the codec base; later layers win.
  const layers = shallowRef<Array<MaybeRefOrGetter<QueryStateValues<TSchema>>>>([])

  function register(source: MaybeRefOrGetter<QueryStateValues<TSchema>>): () => void {
    layers.value = [...layers.value, source]

    return () => {
      layers.value = layers.value.filter(layer => layer !== source)
    }
  }

  // The merged defaults BEFORE the read pipeline: the codec base, then each
  // layer's defined values (later layers win). Feeds value resolution and the
  // clearOnDefault comparison, so both share one notion of "the default".
  const mergedDefaults = computed<Record<string, unknown>>(() => {
    const merged: Record<string, unknown> = { ...codecDefaults }

    for (const source of layers.value) {
      Object.assign(merged, definedOnly(toValue(source) as Record<string, unknown>))
    }

    return merged
  })

  const resolvedDefaults = computed<QueryStateValues<TSchema>>(
    () => pipeline.run('read', { ...mergedDefaults.value }) as QueryStateValues<TSchema>,
  )

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
    const defaults = mergedDefaults.value

    for (const key of keys) {
      if (parsed[key] === undefined && defaults[key] !== undefined) {
        parsed[key] = defaults[key]
      }
    }

    return pipeline.run('read', parsed) as QueryStateValues<TSchema>
  })

  // The explicit selection: params actually present in the URL (or written
  // optimistically), WITHOUT defaults. A defaulted param that fell back to its
  // default parses as present, so it is dropped unless one of its paths exists.
  // Defined-only at the source, so a merge over it never clobbers a default.
  const selected = computed<QueryStateValues<TSchema>>(() => {
    const query = optimisticQuery.value
    const parsed = parseQueryStates(schema, query) as Record<string, unknown>

    for (const key of keys) {
      if (!schema[key].paths.some(path => getPath(query, path) !== undefined)) {
        delete parsed[key]
      }
    }

    return definedOnly(pipeline.run('read', parsed)) as QueryStateValues<TSchema>
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

    if (clearOnDefault && value !== undefined) {
      const defaultValue = mergedDefaults.value[key]

      if (defaultValue !== undefined && definition.eq(value, defaultValue)) {
        map = {}
      }
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
        history: perCall?.history ?? history,
        scroll: perCall?.scroll ?? scroll,
      },
      adapter,
      throttleMs,
    )
  }

  return {
    state: { selected, values },
    defaults: { resolved: resolvedDefaults, register },
    query: { current: () => toValue(adapter.query), set: setValue },
    options: resolvedOptions,
    pipeline,
  }
}
