import type { QueryParamDefinition, QueryParamDefinitionWithDefault } from './define-query-param'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { deletePath, pruneEmptyAncestors } from './path'
import { cloneQuery, compactQuery, mergeQueries } from './query-object'

/**
 * A map of param name to its {@link QueryParamDefinition}.
 *
 * @remarks
 * The keys are the logical names a consumer reads and writes. The query keys a
 * param owns live inside its definition, not in these map keys.
 */
export type QueryStateSchema = Record<string, QueryParamDefinition<any>>

/**
 * Extracts the decoded value type from a single {@link QueryParamDefinition}.
 *
 * @typeParam TDefinition - The definition to read the value type from.
 */
export type QueryStateValueOf<TDefinition>
  = TDefinition extends QueryParamDefinition<infer TValue> ? TValue : never

/**
 * The value a param's reactive ref exposes: `T` when the param declares a
 * default, otherwise `T | undefined`.
 *
 * @remarks
 * A defaulted param never reads back absent, so its ref drops `undefined`. This
 * mirrors the single-param {@link useQueryState} overloads at the schema level.
 *
 * @typeParam TDefinition - The param definition to read the ref value type from.
 */
export type QueryStateRefValue<TDefinition extends QueryParamDefinition<any>>
  = TDefinition extends QueryParamDefinitionWithDefault<any>
    ? QueryStateValueOf<TDefinition>
    : QueryStateValueOf<TDefinition> | undefined

/**
 * The value map for a schema, with every param optional.
 *
 * @remarks
 * Each param is optional because its value may be absent from the query.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]>
}

/**
 * The write map for a schema: omit a param (or pass `undefined`) to leave it
 * untouched, `null` to clear it from the URL, or a value to set it.
 *
 * @remarks
 * `null` is the explicit clear command for batch and standalone writes, distinct
 * from an absent param, which is skipped. Reads never yield `null`: a cleared
 * param reads back `undefined` or its default. This three-state input is what
 * lets a partial write preserve the params it does not mention.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateWriteValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]> | null
}

/**
 * Parses every param in a schema out of a parsed query object.
 *
 * @remarks
 * A param whose value is absent is omitted from the result rather than set to
 * `undefined`.
 *
 * @typeParam TSchema - The schema describing the params to parse.
 * @param schema - The param definitions to parse with.
 * @param query - The parsed query object to read from.
 * @returns A value map holding only the params present in `query`.
 */
export function parseQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  query: ParsedQuery,
): QueryStateValues<TSchema> {
  const values: QueryStateValues<TSchema> = {}

  for (const key of keysOf(schema)) {
    const value = schema[key].parse(query)

    if (value !== undefined) {
      values[key] = value as QueryStateValues<TSchema>[typeof key]
    }
  }

  return values
}

/**
 * Serializes a value map into a nested query object.
 *
 * @remarks
 * Pass selected values only: a param equal to its default should be omitted so
 * the default does not reach the URL. Params with an absent value are skipped,
 * and each remaining param's keys are merged into the result. The result is
 * compacted, so a param that serializes to a blank or empty value leaves no key.
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
      query = mergeQueries(query, schema[key].serialize(value))
    }
  }

  return compactQuery(query)
}

/**
 * Returns every query key the schema manages, across all params.
 *
 * @typeParam TSchema - The schema to inspect.
 * @param schema - The schema whose param paths are gathered.
 * @returns The managed query keys, gathered from each param's `paths` in
 * declaration order.
 */
export function getManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema): string[] {
  return Object.values(schema).flatMap(definition => definition.paths)
}

/**
 * Removes every key the schema manages from a query, leaving unmanaged siblings
 * untouched.
 *
 * @remarks
 * Operates on a clone, so the input `query` is not mutated. Only ancestor
 * objects left empty by the removal are pruned; unmanaged params (including
 * empty ones) are preserved untouched.
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
 * @remarks
 * Strips every managed key from `currentQuery`, then writes `values` back.
 * Unmanaged params are preserved, and a managed key absent from `values` is
 * dropped.
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
 * @remarks
 * Absent (`undefined`) params are dropped too. A param with no default, or whose
 * value differs from its default, is kept. This is the `clearOnDefault` rule as a
 * reusable function, so a caller building a query without the reactive engine,
 * for example to render a link, applies it identically.
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

    if (definition.defaultValue !== undefined && definition.eq(value, definition.defaultValue)) {
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

/**
 * Asserts that no query path is declared by more than one param.
 *
 * @remarks
 * Two params sharing a path would let their reads and writes silently collide,
 * with the last write winning, so this fails loudly instead.
 *
 * @typeParam TSchema - The schema to validate.
 * @param schema - The schema to check.
 * @throws {Error} When a path is declared by more than one param.
 */
export function assertUniquePaths<TSchema extends QueryStateSchema>(schema: TSchema): void {
  const seen = new Set<string>()

  for (const key of Object.keys(schema)) {
    for (const path of schema[key].paths) {
      if (seen.has(path)) {
        throw new Error(`[vuqs] duplicate query path "${path}" declared by multiple params.`)
      }

      seen.add(path)
    }
  }
}
