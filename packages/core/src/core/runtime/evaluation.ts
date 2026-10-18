import type { ParsedQuery } from '../query/types'
import type { DefaultCandidate } from '../schema/params/definition'
import type { QueryStateContributions, QueryStateResolvedValues, QueryStateSchema, QueryStateValues } from '../schema/schema'
import type { Overlay } from './overlay'
import type { PipelineReadContext, PipelineWriteContext, QueryValues, ReadProjection } from './pipeline/contract'
import type { QueryPipelineRuntime } from './pipeline/pipeline'
import type { QueryTransactionRequest } from './transaction'
import { definedOnly } from '../../shared/utils/object'
import { getPath } from '../query/path'
import { prepareDefaultOmission } from '../schema/default-elision'
import { parseQueryStates, serializeQueryStates } from '../schema/operations'
import { projectDefaultCandidates, resolveQueryStateValues } from '../schema/resolution'
import { applyOverlay } from './overlay'

type DefaultCandidates = Readonly<Record<string, DefaultCandidate>>
type ParsedValues = Readonly<Record<string, unknown>>

interface QueryEvaluationOptions<TSchema extends QueryStateSchema> {
  schema: TSchema
  keys: readonly (keyof TSchema & string)[]
  runPipeline: QueryPipelineRuntime<TSchema>['run']
}

interface WriteEvaluationInputs<TSchema extends QueryStateSchema> {
  getQuery: () => ParsedQuery
  getCandidates: () => DefaultCandidates
  shouldClearOnDefault: (key: keyof TSchema & string) => boolean
}

interface OmittedDefault<TKey extends string> {
  key: TKey
  defaultValue: unknown
}

interface PreparedWrite<TKey extends string> {
  touched: TKey[]
  deltas: Overlay
  omitted: OmittedDefault<TKey>[]
}

interface QueryEvaluation<TSchema extends QueryStateSchema> {
  projectExplicit: (parsed: ParsedValues, getQuery: () => ParsedQuery) => QueryStateValues<TSchema>
  projectCandidates: (composed: DefaultCandidates, getQuery: () => ParsedQuery) => QueryStateContributions<TSchema>
  projectResolved: (parsed: ParsedValues, composed: DefaultCandidates, getQuery: () => ParsedQuery) => QueryStateResolvedValues<TSchema>
  prepareWrite: (request: QueryTransactionRequest<TSchema>, inputs: WriteEvaluationInputs<TSchema>) => PreparedWrite<keyof TSchema & string> | undefined
}

/**
 * Creates value projections and write evaluation for a bound schema.
 *
 * @returns Operations sharing the supplied pipeline, with default omission evaluated
 * only for eligible writes. A failed omission evaluation retains the normal write.
 *
 * @internal
 */
export function createQueryEvaluation<TSchema extends QueryStateSchema>(
  options: QueryEvaluationOptions<TSchema>,
): QueryEvaluation<TSchema> {
  const { schema, keys, runPipeline } = options

  return { projectExplicit, projectCandidates, projectResolved, prepareWrite }

  function projectExplicit(parsed: ParsedValues, getQuery: () => ParsedQuery): QueryStateValues<TSchema> {
    return definedOnly(runPipeline('read', { ...parsed }, readContext('explicit', getQuery))) as QueryStateValues<TSchema>
  }

  function projectCandidates(
    composed: DefaultCandidates,
    getQuery: () => ParsedQuery,
  ): QueryStateContributions<TSchema> {
    return runPipeline(
      'read',
      projectDefaultCandidates(composed),
      readContext('defaults', getQuery),
    ) as QueryStateContributions<TSchema>
  }

  function projectResolved(
    parsed: ParsedValues,
    composed: DefaultCandidates,
    getQuery: () => ParsedQuery,
  ): QueryStateResolvedValues<TSchema> {
    // Preserve lower defaults for omitted children.
    return runPipeline(
      'read',
      resolveQueryStateValues(schema, keys, parsed, composed),
      readContext('resolved', getQuery),
    ) as QueryStateResolvedValues<TSchema>
  }

  function prepareWrite(
    request: QueryTransactionRequest<TSchema>,
    inputs: WriteEvaluationInputs<TSchema>,
  ): PreparedWrite<keyof TSchema & string> | undefined {
    const input = request.values as Record<string, unknown>

    for (const key of Object.keys(input)) {
      if (!Object.hasOwn(schema, key)) {
        throw new Error(`[vuqs] cannot write unknown query-state key "${key}".`)
      }
    }

    const requested = new Set(request.mode === 'replace'
      ? keys
      : keys.filter(key => Object.hasOwn(input, key)))

    if (requested.size === 0) {
      return undefined
    }

    const baseQuery = inputs.getQuery()
    const prepared = prepareRequest(request, requested, baseQuery)
    const omittable = prepared.touched.filter(key =>
      prepared.written.has(key) && request.defaultPolicy !== 'preserve-explicit' && inputs.shouldClearOnDefault(key),
    )
    const omission = omittable.length > 0
      ? omitEquivalentDefaults(omittable, prepared.deltas, baseQuery, inputs)
      : undefined

    return {
      touched: prepared.touched,
      deltas: omission?.deltas ?? prepared.deltas,
      omitted: omission?.decisions ?? [],
    }
  }

  // The normal representation of a request: the write registrations run once over the
  // complete explicit map, then every affected param is encoded, before any automatic
  // default omission.
  function prepareRequest(
    request: QueryTransactionRequest<TSchema>,
    requested: ReadonlySet<keyof TSchema & string>,
    query: ParsedQuery,
  ): { touched: Array<keyof TSchema & string>, deltas: Overlay, written: Set<keyof TSchema & string> } {
    const input = request.values as Record<string, unknown>
    const touched = new Set(requested)
    const context: PipelineWriteContext<TSchema> = {
      stage: 'write',
      schema,
      // Captured once: it includes earlier optimistic writes and stays unchanged while
      // the registrations run.
      query,
      request,
    }

    // A value a registration introduces joins the request even when a later one removes it.
    const output = runPipeline('write', { ...input } as QueryValues, context, (step) => {
      for (const key of keys) {
        if (step[key] !== undefined) {
          touched.add(key)
        }
      }
    }) as Record<string, unknown>

    for (const key of Object.keys(output)) {
      if (!Object.hasOwn(schema, key)) {
        throw new Error(`[vuqs] a write registration returned the unknown query-state key "${key}".`)
      }
    }

    const affected = keys.filter(key => touched.has(key))
    const defined: Record<string, unknown> = {}
    const written = new Set<keyof TSchema & string>()

    for (const key of affected) {
      if (output[key] !== undefined) {
        defined[key] = output[key]
        written.add(key)
      }
    }

    const affectedSchema = Object.fromEntries(affected.map(key => [key, schema[key]])) as QueryStateSchema
    const raw = serializeQueryStates(affectedSchema, defined as QueryStateValues<QueryStateSchema>)
    const deltas: Overlay = {}

    for (const key of affected) {
      for (const path of schema[key].paths) {
        const encoded = getPath(raw, path)
        deltas[path] = encoded === undefined ? null : encoded
      }
    }

    return { touched: affected, deltas, written }
  }

  // Omits default-equal representations only when the binding's complete read is
  // unchanged; any evaluation failure keeps the prepared normal write.
  function omitEquivalentDefaults(
    requested: Array<keyof TSchema & string>,
    deltas: Overlay,
    baseQuery: ParsedQuery,
    inputs: WriteEvaluationInputs<TSchema>,
  ): { decisions: OmittedDefault<keyof TSchema & string>[], deltas: Overlay } | undefined {
    try {
      const composed = inputs.getCandidates()
      const normal = applyOverlay(baseQuery, deltas)
      let projectedCandidates: Readonly<Record<string, unknown>> = {}
      const omission = prepareDefaultOmission(schema, requested, normal, {
        explicit: query => projectExplicit(parseQueryStates(schema, query), () => query),
        candidates: (query) => {
          projectedCandidates = projectCandidates(composed, () => query)
          return projectedCandidates
        },
        resolved: query => projectResolved(parseQueryStates(schema, query), composed, () => query),
      })

      if (omission === undefined) {
        return undefined
      }

      const omitted = { ...deltas }
      for (const key of omission.keys) {
        for (const path of schema[key].paths) {
          omitted[path] = null
        }
      }

      return {
        decisions: omission.keys.map(key => ({
          key: key as keyof TSchema & string,
          defaultValue: projectedCandidates[key],
        })),
        deltas: omitted,
      }
    }
    catch {
      return undefined
    }
  }

  function readContext(projection: ReadProjection, getQuery: () => ParsedQuery): PipelineReadContext<TSchema, ReadProjection> {
    // Subscribe to the complete query only when a callback reads it.
    let capturedQuery: ParsedQuery | undefined

    return {
      stage: 'read',
      schema,
      projection,
      get query() {
        return capturedQuery ??= getQuery()
      },
    }
  }
}
