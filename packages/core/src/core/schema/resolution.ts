import type { AnyDefinedQueryParam, DefaultCandidate } from './params/definition'
import type { QueryStateSchema } from './schema'
import { structuralClone } from '../../shared/utils/object'
import { getParamStructure } from './params/definition'

/**
 * How a projected explicit value relates to its projected composed candidate.
 *
 * `absent` has no explicit value, `no-default` has no candidate to compare with,
 * and `equal`/`different` compare two defined values with the param's equality.
 */
export type DefaultClassification = 'absent' | 'no-default' | 'equal' | 'different'

type PlainRecord = Record<string, unknown>

function isRecord(value: unknown): value is PlainRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

/**
 * Composes one default contribution over an already composed lower candidate.
 *
 * Declared object children compose recursively: a defined path overrides the lower
 * value, while an omitted or `undefined` path keeps it. A supported `null` is a
 * defined value. Atomic params replace the lower candidate as a whole. Composition
 * is independent of URL presence and of presence gates.
 *
 * @param param - The param the contribution belongs to.
 * @param lower - The candidate composed so far, if any.
 * @param contribution - The value one source supplies for this param, if any.
 * @returns The composed candidate, or the lower candidate when `contribution` is absent.
 *
 * @internal
 */
export function composeParamDefaults(
  param: AnyDefinedQueryParam,
  lower: DefaultCandidate | undefined,
  contribution: unknown,
): DefaultCandidate | undefined {
  const children = getParamStructure(param)?.children

  if (contribution === undefined) {
    return lower
  }

  if (children === undefined) {
    return { value: contribution, direct: true }
  }

  if (!isRecord(contribution)) {
    return lower
  }

  return composeObjectDefaults(children, lower, contribution)
}

/**
 * Composes a contribution over the declared children of an object.
 *
 * @param children - The declared object children.
 * @param lower - The candidate composed so far, if any.
 * @param contribution - A recursively partial contribution, if any.
 *
 * @internal
 */
export function composeObjectDefaults(
  children: Readonly<Record<string, AnyDefinedQueryParam>>,
  lower: DefaultCandidate | undefined,
  contribution: PlainRecord | undefined,
): DefaultCandidate {
  const composed: Record<string, DefaultCandidate> = {}
  const value: PlainRecord = {}

  for (const key of Object.keys(children)) {
    const next = composeParamDefaults(children[key], lower?.children?.[key], contribution?.[key])

    if (next !== undefined) {
      composed[key] = next

      if (next.value !== undefined) {
        value[key] = next.value
      }
    }
  }

  return { value, direct: true, children: composed }
}

/**
 * Builds the static candidate of an object from its children and own contribution.
 *
 * @internal
 */
export function composeStaticObjectDefaults(
  children: Readonly<Record<string, AnyDefinedQueryParam>>,
  own: PlainRecord | undefined,
): DefaultCandidate {
  const inherited: Record<string, DefaultCandidate> = {}
  const value: PlainRecord = {}

  for (const key of Object.keys(children)) {
    const candidate = getParamStructure(children[key])?.staticCandidate

    if (candidate !== undefined) {
      inherited[key] = candidate

      if (candidate.value !== undefined) {
        value[key] = candidate.value
      }
    }
  }

  const base: DefaultCandidate = {
    value: Object.keys(value).length > 0 ? value : undefined,
    direct: false,
    children: inherited,
  }

  return own === undefined ? base : composeObjectDefaults(children, base, own)
}

/**
 * Resolves an explicit value, or its absence, against the composed candidate.
 *
 * A presence-gated object stays absent without decoded explicit presence, even with
 * direct contributions. An ungated absent object resolves when a source supplied it
 * directly or a child resolves a value; candidates blocked in descendants alone do
 * not create it. Default fallbacks are cloned when no custom resolver handles the value.
 *
 * @param param - The param to resolve.
 * @param explicit - The decoded explicit value, or `undefined` when absent.
 * @param candidate - The composed candidate for this position, if any.
 * @returns The resolved value, or `undefined` when none applies.
 *
 * @internal
 */
export function resolveParamValue(
  param: AnyDefinedQueryParam,
  explicit: unknown,
  candidate: DefaultCandidate | undefined,
): unknown {
  const children = getParamStructure(param)?.children

  if (children === undefined) {
    if (param.resolve !== undefined) {
      return param.resolve(explicit, candidate?.value)
    }

    return explicit !== undefined ? explicit : structuralClone(candidate?.value)
  }

  const present = explicit !== undefined

  if (param.presenceGated === true && !present) {
    return undefined
  }

  const explicitChildren = isRecord(explicit) ? explicit : undefined
  const value: PlainRecord = {}

  for (const key of Object.keys(children)) {
    const resolved = resolveParamValue(children[key], explicitChildren?.[key], candidate?.children?.[key])

    if (resolved !== undefined) {
      value[key] = resolved
    }
  }

  return present || candidate?.direct === true || Object.keys(value).length > 0 ? value : undefined
}

/**
 * Classifies a projected explicit value against the projected composed candidate.
 *
 * Equality is called only when both values are defined, without filling missing
 * explicit children.
 *
 * @internal
 */
export function classifyDefault(
  param: AnyDefinedQueryParam,
  explicit: unknown,
  candidate: unknown,
): DefaultClassification {
  if (explicit === undefined) {
    return 'absent'
  }

  if (candidate === undefined) {
    return 'no-default'
  }

  return param.eq(explicit, candidate) ? 'equal' : 'different'
}

/**
 * Collects the static candidates for the captured schema keys.
 *
 * @returns A map containing only keys that have a candidate.
 *
 * @internal
 */
export function getStaticDefaultCandidates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  keys: readonly (keyof TSchema & string)[] = Object.keys(schema) as Array<keyof TSchema & string>,
): Record<string, DefaultCandidate> {
  const candidates: Record<string, DefaultCandidate> = {}

  for (const key of keys) {
    const candidate = getParamStructure(schema[key])?.staticCandidate

    if (candidate !== undefined) {
      candidates[key] = candidate
    }
  }

  return candidates
}

/**
 * Folds default sources over the static candidates; later sources win.
 *
 * @param schema - The schema whose params the sources contribute to.
 * @param keys - The captured schema keys.
 * @param sources - Contribution maps in installation order.
 *
 * @internal
 */
export function composeDefaultCandidates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  keys: readonly (keyof TSchema & string)[],
  sources: readonly Readonly<Record<string, unknown>>[],
): Record<string, DefaultCandidate> {
  const candidates = getStaticDefaultCandidates(schema, keys)

  for (const source of sources) {
    for (const key of keys) {
      const next = composeParamDefaults(schema[key], candidates[key], source[key])

      if (next !== undefined) {
        candidates[key] = next
      }
    }
  }

  return candidates
}

/**
 * Projects candidates to their composed values.
 *
 * @returns A map containing only keys whose candidate has a value.
 *
 * @internal
 */
export function projectDefaultCandidates(
  candidates: Readonly<Record<string, DefaultCandidate>>,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {}

  for (const key of Object.keys(candidates)) {
    const value = candidates[key].value

    if (value !== undefined) {
      projected[key] = value
    }
  }

  return projected
}

/**
 * Resolves values over candidates for the captured schema keys.
 *
 * @internal
 */
export function resolveQueryStateValues<TSchema extends QueryStateSchema>(
  schema: TSchema,
  keys: readonly (keyof TSchema & string)[],
  explicitValues: Readonly<Record<string, unknown>>,
  candidates: Readonly<Record<string, DefaultCandidate>>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const key of keys) {
    const value = resolveParamValue(schema[key], explicitValues[key], candidates[key])

    if (value !== undefined) {
      resolved[key] = value
    }
  }

  return resolved
}
