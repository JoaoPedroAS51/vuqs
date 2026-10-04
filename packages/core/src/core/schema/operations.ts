import type { ParsedQuery, ParsedQueryRaw } from '../query/types'
import type { QueryParamReadContext } from './params/definition'
import type { QueryStateSchema, QueryStateValues } from './schema'
import { cloneQuery, compactQuery, mergeQueries } from '../query/object'
import { deletePath, pruneEmptyAncestors } from '../query/path'
import { getManagedKeys } from './schema'

/**
 * Parses every param in a schema out of a parsed query object.
 *
 * @typeParam TSchema - The schema describing the params to parse.
 * @param schema - The param definitions to parse with.
 * @param query - The parsed query object to read from.
 * @returns A value map holding only the params validly present in `query`.
 */
export function parseQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  query: ParsedQuery,
  context?: QueryParamReadContext,
): QueryStateValues<TSchema> {
  const values: QueryStateValues<TSchema> = {}

  for (const key of keysOf(schema)) {
    const value = schema[key].read(query, context)

    if (value !== undefined) {
      values[key] = value as QueryStateValues<TSchema>[typeof key]
    }
  }

  return values
}

/**
 * Serializes a value map into a nested query object.
 *
 * @typeParam TSchema - The schema describing the params to serialize.
 * @param schema - The param definitions to serialize with.
 * @param values - The values to write, keyed by param name.
 * @returns A compacted query object combining the keys of every present param.
 */
export function serializeQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  values: QueryStateValues<TSchema>,
): ParsedQueryRaw {
  let query: ParsedQueryRaw = {}

  for (const key of keysOf(schema)) {
    const value = values[key]

    if (value !== undefined) {
      query = mergeQueries(query, schema[key].write(value))
    }
  }

  return compactQuery(query)
}

/**
 * Removes every key the schema manages from a query, leaving unmanaged siblings
 * untouched.
 *
 * @typeParam TSchema - The schema describing which keys to remove.
 * @param schema - The schema whose managed keys are removed.
 * @param query - The query to remove managed keys from.
 * @returns A new query with managed keys removed and ancestor objects left empty
 * by the removal pruned.
 */
export function omitManagedKeys<TSchema extends QueryStateSchema>(
  schema: TSchema,
  query: ParsedQuery,
): ParsedQueryRaw {
  const next = cloneQuery(query)
  const managedKeys = getManagedKeys(schema)

  for (const key of managedKeys) {
    deletePath(next, key)
  }

  for (const key of managedKeys) {
    pruneEmptyAncestors(next, key)
  }

  return next
}

/**
 * Builds the next query after a schema's values change.
 *
 * @typeParam TSchema - The schema describing the managed params.
 * @param schema - The param definitions.
 * @param currentQuery - The query to update.
 * @param values - The new values for the schema's params.
 * @returns A new query merging the preserved unmanaged params with the
 * serialized values.
 */
export function buildQuery<TSchema extends QueryStateSchema>(
  schema: TSchema,
  currentQuery: ParsedQuery,
  values: QueryStateValues<TSchema>,
): ParsedQueryRaw {
  return mergeQueries(omitManagedKeys(schema, currentQuery), serializeQueryStates(schema, values))
}

/**
 * Drops params whose value equals their codec default, so a default never
 * reaches the URL.
 *
 * @typeParam TSchema - The schema describing the params.
 * @param schema - The param definitions, used for per-param equality and defaults.
 * @param values - The values to filter.
 * @returns A new value map without absent or default-valued params.
 */
export function dropDefaults<TSchema extends QueryStateSchema>(
  schema: TSchema,
  values: QueryStateValues<TSchema>,
): QueryStateValues<TSchema> {
  const result: QueryStateValues<TSchema> = {}

  for (const key of keysOf(schema)) {
    const value = values[key]

    if (value === undefined) {
      continue
    }

    const definition = schema[key]

    if (
      definition.clearOnDefault !== false
      && definition.defaultValue !== undefined
      && definition.eq(value, definition.defaultValue)
    ) {
      continue
    }

    result[key] = value
  }

  return result
}

/**
 * Returns a schema's param names typed as a string-key array.
 *
 * @internal
 */
function keysOf<TSchema extends QueryStateSchema>(schema: TSchema): Array<keyof TSchema & string> {
  return Object.keys(schema) as Array<keyof TSchema & string>
}
