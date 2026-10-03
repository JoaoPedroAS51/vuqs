import type { QueryStateSchema, QueryStateValues } from './schema'
import { structuralClone } from '../../shared/utils/object'

/** Returns the static defaults for the captured schema keys. @internal */
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

/** Resolves selections over defaults for the captured schema keys. @internal */
export function resolveQueryStateValues<TSchema extends QueryStateSchema>(
  schema: TSchema,
  keys: readonly (keyof TSchema & string)[],
  selection: Record<string, unknown>,
  defaults: Record<string, unknown>,
): QueryStateValues<TSchema> {
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

  return resolved as QueryStateValues<TSchema>
}
