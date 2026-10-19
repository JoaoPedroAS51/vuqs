import type { ComputedRef } from 'vue'
import type { DebugChannelHandle } from '../diagnostics/bus'
import type { ParsedQuery } from '../query/types'
import type { QueryParamReadContext } from '../schema/params/definition'
import type { QueryStateContributions, QueryStateResolvedValues, QueryStateSchema, QueryStateValues } from '../schema/schema'
import type { NavigateOptions, QueryAdapter } from './adapter'
import type { InstallationRegistry } from './installations'
import type { Overlay } from './overlay'
import type { QueryPipelineRuntime } from './pipeline/pipeline'
import type { QueryTransactionBus, QueryTransactionRequest } from './transaction'
import { computed, onScopeDispose, toValue } from 'vue'
import { structuralEq } from '../../shared/utils/object'
import { bindDebugTarget, emitDebug, emitWarn, isDebugArmed } from '../diagnostics/bus'
import { normalizeForHistory } from '../diagnostics/normalize'
import { registerSnapshotSource } from '../diagnostics/snapshot'
import { getPath } from '../query/path'
import { parseQueryStates } from '../schema/operations'
import { composeDefaultCandidates } from '../schema/resolution'
import { assertUniquePaths, getManagedKeys } from '../schema/schema'
import { createQueryTransactionBus, getQueryRuntime } from './adapter-runtime'
import { createQueryEvaluation } from './evaluation'
import { createInstallationRegistry } from './installations'
import { applyOverlay } from './overlay'
import { createQueryPipeline } from './pipeline/pipeline'

/**
 * Options for {@link createQueryStateEngine}.
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
  /**
   * Coalesces writes within this many ms into one navigation (`0` uses a microtask).
   *
   * @default 0
   */
  throttleMs?: number
  /**
   * Allows default-equal writes to omit their URL representation when the binding
   * reads the same value afterward. Overrides the param and adapter settings.
   *
   * @default The param setting, then `adapterClearOnDefault`, then `true`.
   */
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
  /** The history mode used unless a write overrides it. */
  history?: NavigateOptions['history']
  /** Whether the navigation should scroll. */
  scroll?: NavigateOptions['scroll']
  /** The write-coalescing window in ms (`0` means one microtask). */
  throttleMs: number
  /** The default-omission policy baseline; omission also requires preserving the complete read. */
  clearOnDefault: boolean
}

/**
 * The explicit and default-resolved reactive reads.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateReads<TSchema extends QueryStateSchema> {
  /** Decoded values including optimistic writes and the read pipeline, before engine default resolution. */
  explicitValues: ComputedRef<QueryStateValues<TSchema>>
  /** Param values after default resolution and the resolved read projection. */
  values: ComputedRef<QueryStateResolvedValues<TSchema>>
}

/**
 * The defaults subsystem: read the composed candidates.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 *
 * @internal
 */
export interface QueryDefaultsBus<TSchema extends QueryStateSchema> {
  /** The composed default candidates (static + installed sources), read pipeline applied. */
  candidates: ComputedRef<QueryStateContributions<TSchema>>
}

/**
 * Reactive reads, transactions, and module installations for a bound query schema.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 */
export interface QueryStateEngine<TSchema extends QueryStateSchema> {
  /** The resolved reactive reads. */
  state: QueryStateReads<TSchema>
  /** The defaults subsystem. */
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
  pipeline: QueryPipelineRuntime<TSchema>
  /** This binding's debug handle: the adapter channel bound to this binding's id. */
  debug: DebugChannelHandle
  /**
   * The active module installations: default sources and pipeline registrations join and
   * leave as complete installations.
   */
  installations: InstallationRegistry
}

/**
 * Creates the reactive engine behind URL-bound state.
 *
 * @typeParam TSchema - The schema whose params the engine tracks.
 * @param options - Schema, resolved adapter, and the coalescing and default rules.
 * @returns An engine scoped to this binding and sharing the adapter's query runtime.
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
  // Attribute events to this binding on the shared adapter channel.
  const debug = bindDebugTarget(runtime.debug, { bindingId: id })
  const lastInvalidRaw = new Map<string, unknown>()
  const installations = createInstallationRegistry()
  const pipeline = createQueryPipeline(schema, installations.snapshot)
  const readOverlay = runtime.queue.readOverlay
  const transactions = createQueryTransactionBus(runtime, schema)

  const resolvedOptions: ResolvedQueryStateOptions = {
    history,
    scroll,
    throttleMs,
    clearOnDefault: clearOnDefault ?? adapterClearOnDefault ?? true,
  }

  // Later sources compose over the static candidates; an omitted or undefined path
  // keeps the lower source. Each registration has its own identity, so removing one
  // never removes another that shares its source.
  const candidates = computed(() => composeDefaultCandidates(
    schema,
    keys,
    // Source order is installation order, then occurrence order within an installation.
    installations.snapshot.value.flatMap(installation => installation.defaults).map(({ source }) => toValue(source) ?? {}),
  ))

  // Read layers and pending writes share one projection across bindings, preserving
  // consistent reads when a completed write moves out of the pending queue.
  const decodingQuery = computed<ParsedQuery>((previous) => {
    const query = toValue(adapter.query)
    const current = readOverlay.value

    // Reuse the projection when managed paths are unchanged to avoid invalidating
    // codecs, pipelines, and consumers for unrelated query changes.
    //
    // Unmanaged paths may be stale: definitions read only their declared paths.
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

    const managed: Overlay = {}

    for (const path of managedPaths) {
      if (path in current) {
        managed[path] = current[path]
      }
    }

    const next = applyOverlay(query, managed)

    return next
  })

  // Omit absent values so they cannot overwrite defaults with undefined.
  const parsedValues = computed<Record<string, unknown>>(() => {
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
    const parsed = parseQueryStates(schema, decodingQuery.value, context) as Record<string, unknown>

    for (const path of lastInvalidRaw.keys()) {
      if (!invalid.has(path)) {
        lastInvalidRaw.delete(path)
      }
    }

    return parsed
  })

  const readEffectiveQuery = (): ParsedQuery => applyOverlay(toValue(adapter.query), readOverlay.value)
  const evaluation = createQueryEvaluation({ schema, keys, runPipeline: pipeline.run })
  const writeInputs = {
    getQuery: readEffectiveQuery,
    getCandidates: () => candidates.value,
    shouldClearOnDefault: (key: keyof TSchema & string) =>
      clearOnDefault ?? schema[key].clearOnDefault ?? adapterClearOnDefault ?? true,
  }

  const resolvedDefaults = computed(() => evaluation.projectCandidates(candidates.value, readEffectiveQuery))
  const explicitValues = computed(() => evaluation.projectExplicit(parsedValues.value, readEffectiveQuery))
  const values = computed(() => evaluation.projectResolved(parsedValues.value, candidates.value, readEffectiveQuery))

  const transact = (request: QueryTransactionRequest<TSchema>): void => {
    const input = request.values as Record<string, unknown>

    // Prepare the complete transaction before mutating the shared runtime.
    const prepared = evaluation.prepareWrite(request, writeInputs)

    if (prepared === undefined) {
      return
    }

    const { touched: touchedKeys, deltas } = prepared
    const clearedOnDefault = prepared.omitted.map(({ key, defaultValue }) => ({
      key,
      paths: [...schema[key].paths],
      defaultValue,
    }))

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
        for (const decision of clearedOnDefault) {
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

  // Register even when debug is disarmed so late observers can inspect existing engines.
  const stopSnapshot = registerSnapshotSource(debug, 'engine', () => {
    const query = toValue(adapter.query)

    return {
      id,
      keys: [...keys],
      managedPaths: [...managedPaths],
      committedExplicitValues: normalizeForHistory(
        evaluation.projectExplicit(parseQueryStates(schema, query), () => query),
      ) as Record<string, unknown>,
      optimisticExplicitValues: normalizeForHistory(explicitValues.value) as Record<string, unknown>,
      // Deeply detach and bound: a devtools consumer must not be able to mutate the
      // engine's live values/caches through the snapshot.
      values: normalizeForHistory(values.value) as Record<string, unknown>,
      defaults: normalizeForHistory(resolvedDefaults.value) as Record<string, unknown>,
    }
  })
  // Engines created by the composables own an effect scope. `failSilently` avoids a
  // warning for direct, scope-less construction, where cleanup falls to GC.
  onScopeDispose(() => {
    stopSnapshot()
    releaseRuntime()
  }, true)

  return {
    state: { explicitValues, values },
    defaults: { candidates: resolvedDefaults },
    query: { current: () => toValue(adapter.query), transact, transactions },
    options: resolvedOptions,
    pipeline,
    debug,
    installations: {
      snapshot: installations.snapshot,
      publish: (installation) => {
        for (const { descriptor } of installation.pipeline) {
          emitDebug(debug, 'pipeline:tap', { stages: [descriptor.stage], enforce: descriptor.enforce })
        }
        installations.publish(installation)
      },
      remove: installations.remove,
    },
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
