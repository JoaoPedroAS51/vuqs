import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { QueryAdapter } from './adapter'
import type { DebugChannelHandle } from './debug/bus'
import type { QueryParamReadContext } from './defined-query-param'
import type { QueryPipelineBus, QueryValues } from './pipeline'
import type { Overlay } from './queues/throttle'
import type { QueryStateSchema, QueryStateValues } from './schema'
import type { QueryTransactionBus, QueryTransactionRequest } from './transaction'
import type { NavigateOptions, ParsedQuery } from './types'
import { computed, onScopeDispose, shallowRef, toValue } from 'vue'
import { definedOnly } from '../shared'
import { bindDebugTarget, emitDebug, emitWarn, isDebugArmed } from './debug/bus'
import { normalizeForHistory } from './debug/normalize'
import { registerSnapshotSource } from './debug/snapshot'
import { structuralClone, structuralEq } from './equality'
import { deletePath, getPath, pruneEmptyAncestors, setPath } from './path'
import { createQueryPipeline } from './pipeline'
import { cloneQuery } from './query-object'
import { createQueryTransactionBus, getQueryRuntime } from './query-runtime'
import { assertUniquePaths, getManagedKeys, parseQueryStates, serializeQueryStates } from './schema'

/**
 * Options for {@link createQueryStateEngine}.
 *
 * @remarks
 * Extends {@link NavigateOptions}, so `history` and `scroll` set the navigation
 * defaults applied to every write unless a per-call write overrides them. `schema`
 * and `adapter` are required; `throttleMs` and `clearOnDefault` configure write
 * behavior and have their own defaults.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateEngineOptions<TSchema extends QueryStateSchema> extends NavigateOptions {
  /**
   * Per-binding correlation id, prefixed on this engine's debug logs.
   *
   * @internal
   */
  id: string
  /** The tracked params, used for per-param equality, defaults, and keys. */
  schema: TSchema
  /** The query source and navigate function, resolved from the provided adapter. */
  adapter: QueryAdapter
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its resolved default. Defaults to `true`. */
  clearOnDefault?: boolean
  /** Adapter-level default for `clearOnDefault`. */
  adapterClearOnDefault?: boolean
}

/**
 * The resolved per-instance behavior baseline: the instance options layered over
 * the adapter defaults, fixed at construction. Per-call writes still override
 * `history`/`scroll` through `query.transact`.
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
  /** Explicit selection plus overlay, with the read pipeline applied and without defaults. */
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
 * The reactive core behind URL-bound state, used by {@link useQueryState} and
 * {@link useQueryStates}, organized into facets: `state` (reads), `defaults`
 * (subsystem), `query` (I/O), `options` (resolved behavior), and `pipeline`.
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
    /** Atomically applies a query-state transaction. */
    transact: (request: QueryTransactionRequest<TSchema>) => void
    /** Observes starts whose raw paths overlap this schema. */
    transactions: QueryTransactionBus<TSchema>
  }
  /** The resolved per-instance behavior baseline. */
  options: ResolvedQueryStateOptions
  /** The transform pipeline applied to reads and writes. */
  pipeline: QueryPipelineBus
  /** This binding's debug handle: the adapter channel bound to this binding's id. */
  debug: DebugChannelHandle
}

/**
 * Parses the explicit raw selection for a schema without defaults or pipelines.
 *
 * @internal
 */
export function parseRawQuerySelection<TSchema extends QueryStateSchema>(
  schema: TSchema,
  query: ParsedQuery,
  context?: QueryParamReadContext,
): QueryStateValues<TSchema> {
  return parseQueryStates(schema, query, context)
}

/**
 * Creates the reactive engine behind URL-bound state.
 *
 * @remarks
 * Committed model: the URL is the source of truth. A write serializes to raw
 * deltas in one optimistic overlay shared by every engine using the same adapter,
 * so concurrent writes coalesce into one navigation instead of racing.
 * Once the URL reflects a delta that param's overlay entry is reconciled away;
 * entries the URL has not caught up to are kept, so an unrelated navigation cannot
 * discard an in-flight write.
 *
 * Defaults resolve through a layered stack: the codec defaults are the base, and
 * modules contribute reactive layers via `defaults.register`. The merged result
 * feeds both value resolution and the `clearOnDefault` decision, so reads and
 * writes share one notion of "the default".
 *
 * The adapter runtime owns one committed-query observer regardless of binding count.
 * Each engine stabilizes its managed-path projection, so an unrelated URL change does
 * not propagate through its codecs, pipeline, or consuming component effects.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 * @param options - Schema, resolved adapter, and the coalescing and default rules.
 * @returns The engine facets: `state`, `defaults`, `query`, `options`, `pipeline`, `debug`.
 */
export function createQueryStateEngine<TSchema extends QueryStateSchema>(
  options: QueryStateEngineOptions<TSchema>,
): QueryStateEngine<TSchema> {
  const {
    id,
    schema,
    adapter,
    history,
    scroll,
    throttleMs = 0,
    clearOnDefault,
    adapterClearOnDefault,
  } = options
  assertUniquePaths(schema)

  const keys = Object.keys(schema) as Array<keyof TSchema & string>
  const managedPaths = getManagedKeys(schema)

  const runtime = getQueryRuntime(adapter)
  const releaseRuntime = runtime.queue.retainBinding()
  // A binding-scoped view over the adapter channel: every event this engine, its
  // pipeline, and its binding emit carries this binding's id without a call site
  // having to thread it.
  const debug = bindDebugTarget(runtime.debug, { bindingId: id })
  const lastInvalidRaw = new Map<string, unknown>()
  const pipeline = createQueryPipeline(debug)
  const overlay = runtime.queue.overlay
  const transactions = createQueryTransactionBus(runtime, schema)

  const resolvedOptions: ResolvedQueryStateOptions = {
    history,
    scroll,
    throttleMs,
    clearOnDefault: clearOnDefault ?? adapterClearOnDefault ?? true,
  }

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

  // The merged defaults before the read pipeline: the codec base, then each
  // layer's defined values (later layers win). Feeds value resolution before the
  // read pipeline is applied to the complete map.
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
  const optimisticQuery = computed<ParsedQuery>((previous) => {
    const query = toValue(adapter.query)
    const current = overlay.value

    // Adapter queries and the shared overlay are object-level reactive sources, so any
    // path change invalidates every engine. Preserve the previous projection when none
    // of this engine's raw paths changed: Vue can then stop the invalidation here instead
    // of re-running codecs, pipelines, defaults, and component effects for unrelated
    // bindings. The projection may keep stale *unmanaged* paths, which is safe because a
    // definition's declared paths are the complete read boundary for this engine.
    if (previous !== undefined) {
      const unchanged = managedPaths.every((path) => {
        const effective = Object.hasOwn(current, path)
          ? current[path] === null ? undefined : current[path]
          : getPath(query, path)

        return structuralEq(getPath(previous, path), effective)
      })

      if (unchanged) {
        return previous
      }
    }

    const next = cloneQuery(query)

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

  // The explicit selection before the read pipeline: each param's decoded URL
  // value, with absent or invalid params omitted (`read` is a selection, so it
  // returns `undefined` for both). Defined-only, so layering it over the defaults
  // never clobbers one with `undefined`, and an invalid value never masquerades as
  // its default.
  const rawSelection = computed<Record<string, unknown>>(() => {
    const invalid = new Set<string>()
    const context: QueryParamReadContext = {
      onInvalid(path, raw) {
        invalid.add(path)
        if (!sameDiagnosticValue(lastInvalidRaw.get(path), raw)) {
          if (isDebugArmed(debug)) {
            lastInvalidRaw.set(path, raw)
            emitWarn(debug, 'engine:parse-miss', { path, raw })
          }
        }
      },
    }
    const selection = parseRawQuerySelection(schema, optimisticQuery.value, context) as Record<string, unknown>

    for (const path of lastInvalidRaw.keys()) {
      if (!invalid.has(path)) {
        lastInvalidRaw.delete(path)
      }
    }

    return selection
  })

  const selected = computed<QueryStateValues<TSchema>>(
    () => definedOnly(pipeline.run('read', { ...rawSelection.value })) as QueryStateValues<TSchema>,
  )

  // The effective read: each param's selection composed over its resolved default.
  // An absent param takes the default; a present composite param composes per child
  // through `resolve`, so a runtime default reaches a missing child of a present
  // object instead of the selection shadowing the whole default entry.
  const values = computed<QueryStateValues<TSchema>>(() => {
    const selection = rawSelection.value
    const defaults = mergedDefaults.value
    const resolved: Record<string, unknown> = {}

    for (const key of keys) {
      const definition = schema[key]
      const selectedValue = selection[key]
      const value = selectedValue !== undefined
        // Present: a composite composes per child over its default; a scalar is the
        // selection itself.
        ? definition.resolve
          ? definition.resolve(selectedValue, defaults[key])
          : selectedValue
        // Absent: the resolved default, unless the param is presence gated (it stays
        // absent). Cloned so a consumer mutation cannot corrupt the shared default.
        : definition.presenceGated
          ? undefined
          : structuralClone(defaults[key])

      if (value !== undefined) {
        resolved[key] = value
      }
    }

    return pipeline.run('read', resolved) as QueryStateValues<TSchema>
  })

  function serializeParam(
    key: keyof TSchema & string,
    value: unknown,
    defaultPolicy: QueryTransactionRequest<TSchema>['defaultPolicy'],
    clearedOnDefault?: Array<{ key: string, paths: readonly string[], defaultValue: unknown }>,
  ): Overlay {
    const definition = schema[key]
    const single: QueryStateSchema = { [key]: definition }

    let map: QueryStateValues<QueryStateSchema> = value === undefined ? {} : { [key]: value }

    if (
      defaultPolicy !== 'preserve-explicit'
      && !definition.presenceGated
      && shouldClearOnDefault(definition)
      && value !== undefined
    ) {
      const defaultValue = resolvedDefaults.value[key]

      if (defaultValue !== undefined && definition.eq(value, defaultValue)) {
        clearedOnDefault?.push({ key, paths: [...definition.paths], defaultValue })
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

  function shouldClearOnDefault(definition: TSchema[keyof TSchema & string]): boolean {
    return clearOnDefault ?? definition.clearOnDefault ?? adapterClearOnDefault ?? true
  }

  function transact(request: QueryTransactionRequest<TSchema>): void {
    const input = request.values as Record<string, unknown>

    for (const key of Object.keys(input)) {
      if (!Object.hasOwn(schema, key)) {
        throw new Error(`[vuqs] cannot write unknown query-state key "${key}".`)
      }
    }

    const touchedKeys = request.mode === 'replace'
      ? keys
      : keys.filter(key => Object.hasOwn(input, key) && input[key] !== undefined)

    if (touchedKeys.length === 0) {
      return
    }

    const deltas: Overlay = {}
    const clearedOnDefault = isDebugArmed(debug)
      ? [] as Array<{ key: string, paths: readonly string[], defaultValue: unknown }>
      : undefined

    // Serialize the complete transaction before mutating the shared runtime. A
    // codec or pipeline error therefore cannot leave a partial optimistic write.
    for (const key of touchedKeys) {
      const value = input[key]
      const normalized = request.mode === 'patch' && value === null ? undefined : value
      Object.assign(deltas, serializeParam(key, normalized, request.defaultPolicy, clearedOnDefault))
    }

    const resolvedOptions: NavigateOptions = {
      history: request.navigation?.history ?? history,
      scroll: request.navigation?.scroll ?? scroll,
    }

    runtime.applyTransaction({
      mode: request.mode,
      paths: Object.keys(deltas),
      origin: request.origin,
    }, (transaction, debugContext) => {
      // Emit inside the callback so the transaction id is assigned: it correlates this
      // write with the queue events it produces.
      if (debugContext !== undefined) {
        const touchedPaths = touchedKeys.flatMap(key => schema[key].paths)
        // User equality/pipeline code may arm the channel after the initial cost guard.
        for (const decision of clearedOnDefault ?? []) {
          emitDebug(debug, 'engine:clear-on-default', { id, keys, ...decision }, debugContext)
        }
        emitDebug(
          debug,
          'binding:set',
          { id, keys, managedPaths, touched: touchedKeys, touchedPaths, values: input, options: resolvedOptions },
          debugContext,
        )
      }
      runtime.queue.push(deltas, resolvedOptions, throttleMs, transaction.id)
    })
  }

  // Describe this engine's live state for a devtools snapshot. Registered regardless of
  // whether debug is armed (so a late-attaching consumer sees engines created earlier),
  // and removed with the owning effect scope so it does not accumulate on the long-lived
  // per-adapter channel. Resolved values only, never raw default layers.
  const stopSnapshot = registerSnapshotSource(debug, 'engine', () => ({
    id,
    keys: [...keys],
    managedPaths: [...managedPaths],
    committedSelected: normalizeForHistory(
      definedOnly(pipeline.run('read', {
        ...parseRawQuerySelection(schema, toValue(adapter.query)),
      })),
    ) as Record<string, unknown>,
    optimisticSelected: normalizeForHistory(selected.value) as Record<string, unknown>,
    // Deeply detach and bound: a devtools consumer must not be able to mutate the
    // engine's live values/caches through the snapshot.
    values: normalizeForHistory(values.value) as Record<string, unknown>,
    defaults: normalizeForHistory(resolvedDefaults.value) as Record<string, unknown>,
  }))
  // Engines created by the composables own an effect scope. `failSilently` avoids a
  // warning for direct, scope-less construction, where cleanup falls to GC.
  onScopeDispose(() => {
    stopSnapshot()
    releaseRuntime()
  }, true)

  return {
    state: { selected, values },
    defaults: { resolved: resolvedDefaults, register },
    query: { current: () => toValue(adapter.query), transact, transactions },
    options: resolvedOptions,
    pipeline,
    debug,
  }
}

function sameDiagnosticValue(previous: unknown, next: unknown): boolean {
  try {
    return structuralEq(previous, next)
  }
  /* v8 ignore next 2 -- only a ParsedQuery proxy or getter can make structural comparison throw */
  catch {
    return Object.is(previous, next)
  }
}
