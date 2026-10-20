import type { ParsedQuery, ParsedQueryRaw } from '../query/types'
import type { AnyDefinedQueryParam } from './params/definition'
import type { QueryStateSchema, QueryStateValues } from './schema'
import { definedOnly } from '../../shared/utils/object'
import { omitManagedKeys, parseQueryStates, serializeQueryStates } from './operations'
import {
  classifyDefault,
  getStaticDefaultCandidates,
  projectDefaultCandidates,
  resolveQueryStateValues,
} from './resolution'

/**
 * The explicit, candidate, and resolved reads used to evaluate a default omission.
 *
 * @internal
 */
export interface DefaultOmissionEvaluator {
  /** Decodes and projects the explicit values of a query. */
  explicit: (query: ParsedQuery) => Readonly<Record<string, unknown>>
  /** Projects the composed default candidates for the evaluated query. */
  candidates: (query: ParsedQuery) => Readonly<Record<string, unknown>>
  /** Decodes, resolves and projects the complete read of a query. */
  resolved: (query: ParsedQuery) => Readonly<Record<string, unknown>>
}

/** @internal */
export interface DefaultOmission {
  /** The schema keys whose representation the alternative omits. */
  keys: string[]
  /** The normal query without the omitted representations. */
  query: ParsedQueryRaw
}

/**
 * Resolves the param's omission policy over the instance and adapter defaults.
 *
 * @internal
 */
export function resolveClearOnDefault(
  param: AnyDefinedQueryParam,
  instanceClearOnDefault?: boolean,
  adapterClearOnDefault?: boolean,
): boolean {
  return param.clearOnDefault ?? instanceClearOnDefault ?? adapterClearOnDefault ?? true
}

/**
 * Decides whether default-equal representations can be omitted without changing the read.
 *
 * Requested keys qualify when the normal representation decodes to an explicit value
 * classified equal to its composed candidate. All qualifying keys are omitted together;
 * the omission is used only when the complete read of the alternative query equals the
 * complete read of the normal query under each param's equality.
 *
 * @param schema - The schema of the writing binding or static utility.
 * @param requested - The keys with a defined effective write that policy allows to omit.
 * @param normal - The query containing the normal representation.
 * @param evaluator - The reads the decision compares.
 * @returns The omission to publish, or `undefined` when nothing qualifies or it is unsafe.
 *
 * @internal
 */
export function prepareDefaultOmission<TSchema extends QueryStateSchema>(
  schema: TSchema,
  requested: readonly (keyof TSchema & string)[],
  normal: ParsedQuery,
  evaluator: DefaultOmissionEvaluator,
): DefaultOmission | undefined {
  if (requested.length === 0) {
    return undefined
  }

  const explicit = evaluator.explicit(normal)
  const candidates = evaluator.candidates(normal)
  const keys = requested.filter(key => classifyDefault(schema[key], explicit[key], candidates[key]) === 'equal')

  if (keys.length === 0) {
    return undefined
  }

  const subset: QueryStateSchema = {}
  for (const key of keys) {
    subset[key] = schema[key]
  }

  const query = omitManagedKeys(subset, normal)

  return readsEquivalent(schema, evaluator.resolved(normal), evaluator.resolved(query))
    ? { keys, query }
    : undefined
}

/**
 * Compares two complete reads with each param's equality.
 *
 * Absence is compared explicitly and never passed to an equality function.
 *
 * @internal
 */
export function readsEquivalent<TSchema extends QueryStateSchema>(
  schema: TSchema,
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  for (const key of Object.keys(schema)) {
    const left = a[key]
    const right = b[key]

    if (left === undefined || right === undefined) {
      if (left !== right) {
        return false
      }

      continue
    }

    if (!schema[key].eq(left, right)) {
      return false
    }
  }

  return true
}

/**
 * Creates the reads for a decision that uses only the schema's static defaults.
 *
 * @internal
 */
export function createStaticOmissionEvaluator<TSchema extends QueryStateSchema>(
  schema: TSchema,
): DefaultOmissionEvaluator {
  const keys = Object.keys(schema) as Array<keyof TSchema & string>
  const candidates = getStaticDefaultCandidates(schema, keys)

  return {
    explicit: query => parseQueryStates(schema, query),
    candidates: () => projectDefaultCandidates(candidates),
    resolved: query => resolveQueryStateValues(schema, keys, parseQueryStates(schema, query), candidates),
  }
}

/**
 * Filters values according to each param's default-clearing policy.
 *
 * A defined value is dropped only when its serialized representation decodes to a value equal
 * to the static default and omitting it leaves the complete static read unchanged.
 *
 * @typeParam TSchema - The schema describing the params.
 * @param schema - The param definitions, used for per-param equality and defaults.
 * @param values - The values to filter.
 * @returns A new map without `undefined` values or default-equal values that can be
 * safely omitted under `clearOnDefault`. Retained values are the supplied explicit values.
 */
export function dropDefaults<TSchema extends QueryStateSchema>(
  schema: TSchema,
  values: QueryStateValues<TSchema>,
): QueryStateValues<TSchema> {
  const defined = definedOnly(values)
  const requested = (Object.keys(defined) as Array<keyof TSchema & string>)
    .filter(key => schema[key].clearOnDefault !== false)
  const omission = prepareDefaultOmission(
    schema,
    requested,
    serializeQueryStates(schema, defined),
    createStaticOmissionEvaluator(schema),
  )

  if (omission === undefined) {
    return defined
  }

  const result: QueryStateValues<TSchema> = {}
  for (const key of Object.keys(defined) as Array<keyof TSchema & string>) {
    if (!omission.keys.includes(key)) {
      result[key] = defined[key]
    }
  }

  return result
}
