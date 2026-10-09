import type { QueryStateSchema, QueryStateValues } from './schema'
import { structuralClone } from '../../shared/utils/object'

/**
 * Collects static defaults for the captured schema keys.
 *
 * @returns A map containing only defaults that are not `undefined`.
 *
 * @internal
 */
export function getStaticQueryDefaults<TSchema extends QueryStateSchema>(
  schema: TSchema,
  keys: readonly (keyof TSchema & string)[],
): Record<string, unknown> {
  const codecDefaults: Record<string, unknown> = {}
  for (const key of keys) {
    const value = schema[key].defaultValue
    if (value !== undefined) {
      codecDefaults[key] = value
    }
  }

  return codecDefaults
}

/** Resolves values over defaults for the captured schema keys. @internal */
export function resolveQueryStateValues<TSchema extends QueryStateSchema>(
  schema: TSchema,
  keys: readonly (keyof TSchema & string)[],
  explicitValues: Record<string, unknown>,
  defaults: Record<string, unknown>,
): QueryStateValues<TSchema> {
  const resolved: Record<string, unknown> = {}

  for (const key of keys) {
    const definition = schema[key]
    const explicitValue = explicitValues[key]
    const value = explicitValue !== undefined
      // Present: a composite composes per child over its default; a scalar is the
      // explicit value itself.
      ? definition.resolve
        ? definition.resolve(explicitValue, defaults[key])
        : explicitValue
      // Absent: the resolved default, unless the param is presence gated (it stays
      // absent). Cloned so a consumer mutation cannot corrupt the shared default.
      : definition.presenceGated
        ? undefined
        : structuralClone(defaults[key])

    if (value !== undefined) {
      resolved[key] = value
    }
  }

  return resolved as QueryStateValues<TSchema>
}
